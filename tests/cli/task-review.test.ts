import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readTaskRecord } from "../../src/core/tasks/records.js";
import { type GitWorkspace } from "../helpers/git-workspace.js";
import { CHANGE, CHANGE_DIR, createTaskWorkspace, report, taskSteps } from "../helpers/task-workspace.js";

let ws: GitWorkspace;
let root: string;
let steps: ReturnType<typeof taskSteps>;

beforeEach(() => {
  ws = createTaskWorkspace();
  root = ws.root;
  steps = taskSteps(root);
});
afterEach(() => ws.remove());

describe("lexforge task review", () => {
  it("registers an approval against the current green", async () => {
    const greenCommit = await steps.greenDone("1.1");
    const file = report({ reviewer: "rev-1", verdict: "approved" });
    const result = await steps.review("1.1", file);
    expect(result.exitCode).toBe(0);
    expect(readTaskRecord(root, CHANGE, "1.1")!.reviews.at(-1)).toMatchObject({
      reviewer: "rev-1",
      verdict: "approved",
      green: greenCommit,
    });
    expect(result.json.data?.nextStep).toBe("lexforge task close --change demo --task 1.1");
    expect(readFileSync(path.join(root, CHANGE_DIR, "tasks/1.1/reviews/1.md"), "utf8")).toBe(readFileSync(file, "utf8"));
  });

  it("refuses a report from the executor", async () => {
    await steps.greenDone("1.1");
    const result = await steps.review("1.1", report({ reviewer: "exec-1" }));
    expect(result.json.error?.code).toBe("reviewer-is-executor");
    expect(result.json.nextStep).toBe(
      "send lexforge/changes/demo/tasks/1.1/review.md to another reviewer, then run: lexforge task review --change demo --task 1.1 --file <report.md>",
    );
  });

  it("refuses a review before green", async () => {
    await steps.redDone("1.1");
    const result = await steps.review("1.1", report());
    expect(result.json.error?.code).toBe("green-missing");
    expect(result.json.nextStep).toBe("lexforge task green --change demo --task 1.1");
  });

  it("refuses a review that leaves a control of the task unconfirmed", async () => {
    await steps.greenDone("7.1");
    const result = await steps.review("7.1", report({ controls: [] }));
    expect(result.json.error).toMatchObject({ code: "control-not-confirmed", message: expect.stringContaining("migrations") });
    expect(result.json.nextStep).toBe(
      "check migrations, then run: lexforge task review --change demo --task 7.1 --file <report.md>",
    );
  });

  it("accepts a review that confirms the control", async () => {
    await steps.greenDone("7.1");
    expect((await steps.review("7.1", report({ controls: ["migrations"] }))).exitCode).toBe(0);
  });

  it("names the fix loop when findings block", async () => {
    await steps.greenDone("1.1");
    const result = await steps.review("1.1", report({ verdict: "changes-requested", findings: ["- important: x"] }));
    expect(result.json.data?.nextStep).toBe(
      "fix the findings in the worktree, commit, run: lexforge task green --change demo --task 1.1",
    );
    expect(readTaskRecord(root, CHANGE, "1.1")!.reviews.at(-1)!.findings).toEqual([
      { id: "F1", level: "important", message: "x" },
    ]);
  });

  it("refuses a report it cannot read and names the format", async () => {
    await steps.greenDone("1.1");
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const os = await import("node:os");
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), "lexforge-bad-")), "r.md");
    writeFileSync(file, "looks fine to me\n");
    const result = await steps.review("1.1", file);
    expect(result.json.error?.code).toBe("review-report-unreadable");
    expect(result.json.nextStep).toBe(
      `rewrite ${file} in the report format, then run: lexforge task review --change demo --task 1.1 --file <report.md>`,
    );
  });
});
