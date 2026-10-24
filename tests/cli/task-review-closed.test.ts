import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { taskFindings } from "../../src/core/gates/verify-change-tasks.js";
import { registerFinalReview } from "../../src/core/tasks/final-review.js";
import { readTaskRecord, writeTaskRecord } from "../../src/core/tasks/records.js";
import { createTwoTaskChange, twoTaskSteps } from "../helpers/final-review-fixture.js";
import type { GitWorkspace } from "../helpers/git-workspace.js";
import { CHANGE, cli, expectOk, report } from "../helpers/task-workspace.js";

let ws: GitWorkspace | undefined;
let root: string;
afterEach(() => ws?.remove());

beforeEach(async () => {
  ws = createTwoTaskChange();
  root = ws.root;
  const steps = twoTaskSteps(root);
  await steps.approved("1.2", "exec-2");
  expectOk(await steps.close("1.2"), "close 1.2");
  await steps.closed("1.1", "exec-1");
  registerFinalReview(root, CHANGE, report({ reviewer: "final-1", verdict: "approved" }));
}, 60_000);

const review = (id: string, reviewer: string) =>
  cli(root, ["task", "review", "--change", CHANGE, "--task", id, "--file", report({ reviewer })]);

describe("lexforge task review on a closed task", { timeout: 60_000 }, () => {
  it("takes the review a closed task lacks, and verify clears the finding", async () => {
    writeTaskRecord(root, CHANGE, { ...readTaskRecord(root, CHANGE, "1.2")!, reviews: [] });
    const [finding] = taskFindings(root, CHANGE);
    expect(finding.rule).toBe("task-not-reviewed");
    expect(finding.message).toContain("Run: lexforge task review --change demo --task 1.2 --file <report.md>");

    const registered = await review("1.2", "rev-late");
    expect(registered.exitCode).toBe(0);
    expect(registered.json.data.nextStep).toBe("lexforge verify --change demo");
    expect(readTaskRecord(root, CHANGE, "1.2")!.reviews).toHaveLength(1);
    expect(taskFindings(root, CHANGE)).toEqual([]);
  });

  it("still refuses a closed task whose review already covers its green commit", async () => {
    const refused = await review("1.2", "rev-late");
    expect(refused.exitCode).toBe(2);
    expect(refused.json.error.code).toBe("task-already-closed");
    expect(readTaskRecord(root, CHANGE, "1.2")!.reviews).toHaveLength(1);
  });

  it("still refuses the executor's own review of a closed task", async () => {
    writeTaskRecord(root, CHANGE, { ...readTaskRecord(root, CHANGE, "1.2")!, reviews: [] });
    const refused = await review("1.2", "exec-2");
    expect(refused.json.error.code).toBe("reviewer-is-executor");
  });
});
