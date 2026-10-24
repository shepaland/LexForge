import { rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { taskFindings } from "../../../src/core/gates/verify-change-tasks.js";
import { registerFinalReview } from "../../../src/core/tasks/final-review.js";
import { finalReviewPath, taskRecordPath } from "../../../src/core/tasks/paths.js";
import { readTaskRecord, writeTaskRecord } from "../../../src/core/tasks/records.js";
import { writeWorkflowFile } from "../../../src/core/tasks/workflow-file.js";
import {
  createMigratedChangeAllClosed,
  createTwoTaskChange,
  twoTaskSteps,
} from "../../helpers/final-review-fixture.js";
import { git, type GitWorkspace } from "../../helpers/git-workspace.js";
import { CHANGE, commitOnChangeBranch as commitOn, expectOk, report } from "../../helpers/task-workspace.js";

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

function tickByHand(id: string): void {
  rmSync(taskRecordPath(root, CHANGE, id));
}

function tickWithOpenRecord(id: string): void {
  writeTaskRecord(root, CHANGE, { ...readTaskRecord(root, CHANGE, id)!, closed: null });
}

/** Moves the change branch back past the merge of the task and commits the same tree, so its commits are gone. */
function rewriteChangeBranchDroppingTask(id: string): void {
  const merge = readTaskRecord(root, CHANGE, id)!.closed!.merge;
  git(root, "reset", "--soft", `${merge}^1`);
  git(root, "add", "--all");
  git(root, "commit", "--message", `task ${id} squashed`);
}

function removeFinalReview(): void {
  rmSync(finalReviewPath(root, CHANGE));
}

function commitOnChangeBranch(files: Record<string, string>): void {
  commitOn(root, files);
}

function finalReviewWith(finding: string): void {
  registerFinalReview(root, CHANGE, report({ reviewer: "final-2", verdict: "changes-requested", findings: [finding] }));
}

function migratedChangeAllClosedHistorically(): void {
  ws?.remove();
  ws = createMigratedChangeAllClosed();
  root = ws.root;
}

describe("taskFindings", { timeout: 60_000 }, () => {
  it("is clean for a change closed by the 6.0.0 commands", () => {
    expect(taskFindings(root, "demo")).toEqual([]);
  });

  it.each([
    ["ticked-task-without-record", () => tickByHand("1.2")],
    ["task-record-not-closed", () => tickWithOpenRecord("1.2")],
    ["recorded-commit-missing", () => rewriteChangeBranchDroppingTask("1.1")],
    ["final-review-missing", () => removeFinalReview()],
    ["final-review-stale", () => commitOnChangeBranch({ "src/x.js": "late" })],
    ["final-review-findings-open", () => finalReviewWith("- critical: x")],
  ])("finds %s", (rule, spoil) => {
    spoil();
    expect(taskFindings(root, "demo").map((f) => f.rule)).toEqual([rule]);
  });

  it("puts a task finding on the task line and a final review finding on final-review.json", () => {
    tickByHand("1.2");
    removeFinalReview();
    expect(taskFindings(root, "demo").map((f) => [f.file, f.line, f.rule])).toEqual([
      ["lexforge/changes/demo/tasks.md", 10, "ticked-task-without-record"],
      ["lexforge/changes/demo/final-review.json", 1, "final-review-missing"],
    ]);
  });

  it("finds a short-path change that outgrew the short path after its red", () => {
    writeWorkflowFile(root, CHANGE, { version: 3, schema: "spec-driven", schemaVersion: 1, path: "short" });
    expect(taskFindings(root, "demo").map((f) => [f.file, f.rule])).toEqual([
      ["lexforge/changes/demo/tasks.md", "short-path-not-eligible"],
    ]);
  });

  it("a historical record counts as closed and needs no commits", () => {
    migratedChangeAllClosedHistorically();
    expect(taskFindings(root, "demo").map((f) => f.rule)).toEqual(["final-review-missing"]);
  });
});
