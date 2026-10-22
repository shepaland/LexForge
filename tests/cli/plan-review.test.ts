import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { type GitWorkspace } from "../helpers/git-workspace.js";
import {
  CHANGE,
  allFourApproved,
  cli,
  createPlanWorkspace,
  edit,
  review,
  writeReport,
} from "../helpers/plan-fixture.js";

let ws: GitWorkspace;
let root: string;

beforeEach(() => {
  ws = createPlanWorkspace();
  root = ws.root;
});
afterEach(() => ws.remove());

describe("lexforge plan review", () => {
  it("registers a report against the current digest and copies the file into the change", async () => {
    const result = await review(root, "specs");
    expect(result.exitCode).toBe(0);
    expect(result.json.data).toMatchObject({
      angle: "specs",
      verdict: "approved",
      pending: ["code", "dependencies", "gaps"],
      nextStep: "lexforge plan review --change demo --angle code --file <report.md>",
    });
    const copy = join(root, "lexforge/changes/demo/plan-reviews/specs-1.md");
    expect(existsSync(copy)).toBe(true);
    expect(readFileSync(copy, "utf8")).toContain("Reviewer: plan-reviewer-1");
  });

  it("numbers the reports of one angle in order", async () => {
    await review(root, "gaps", "changes-requested", "- minor: wording");
    await review(root, "gaps");
    expect(existsSync(join(root, "lexforge/changes/demo/plan-reviews/gaps-2.md"))).toBe(true);
  });

  it("names approve as the next step once all four angles approved the current digest", async () => {
    await allFourApproved(root);
    const last = await review(root, "gaps");
    expect(last.json.data?.pending).toEqual([]);
    expect(last.json.data?.nextStep).toBe("lexforge plan approve --change demo --quote \"<owner's words>\"");
  });

  it("names fixing the plan when a report holds a critical finding", async () => {
    const result = await review(root, "gaps", "changes-requested", "- critical: no task for scenario Y");
    expect(result.exitCode).toBe(0);
    expect(result.json.data?.nextStep).toBe(
      "fix the plan, then run: lexforge plan review --change demo --angle gaps --file <report.md>",
    );
  });

  it("an approval of an older digest does not count", async () => {
    await review(root, "specs");
    edit(root, "1.1", "renamed");
    const result = await review(root, "code");
    expect(result.json.data?.pending).toEqual(["specs", "dependencies", "gaps"]);
  });

  it("refuses a review while check plan has findings", async () => {
    edit(root, "1.1", "TODO");
    const result = await review(root, "specs");
    expect(result.exitCode).toBe(2);
    expect(result.json.error?.code).toBe("plan-check-failing");
    expect(result.json.nextStep).toBe("lexforge check plan --change demo");
  });

  it("refuses an unknown angle", async () => {
    const result = await review(root, "style");
    expect(result.json.error?.code).toBe("unknown-angle");
    expect(result.json.nextStep).toContain("specs|code|dependencies|gaps|amendment");
  });

  it("refuses an unreadable report", async () => {
    const file = writeReport(root, "no verdict here\n");
    const result = await cli(root, ["plan", "review", "--change", CHANGE, "--angle", "specs", "--file", file]);
    expect(result.json.error?.code).toBe("review-report-unreadable");
  });

  it("refuses a missing report file", async () => {
    const result = await cli(root, ["plan", "review", "--change", CHANGE, "--angle", "specs", "--file", "nope.md"]);
    expect(result.json.error?.code).toBe("review-report-unreadable");
  });

  it("refuses the amendment angle while no amendment waits for a review", async () => {
    const result = await review(root, "amendment");
    expect(result.json.error?.code).toBe("no-amendment-pending");
    expect(result.json.nextStep).toContain("lexforge plan amend --change demo");
  });

  it("states what the group holds when no subcommand is named", async () => {
    const capture = createCapture();
    const exitCode = await run(["plan"], { cwd: root, stdout: capture.stdout, stderr: capture.stderr });
    expect(exitCode).toBe(2);
    expect(capture.err).toContain("review");
    expect(capture.err).toContain("approve");
    expect(capture.err).toContain("amend");
  });
});
