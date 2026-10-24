import { featureBranchName } from "../../src/core/git/feature-branch.js";
import { readFinalReviews } from "../../src/core/tasks/final-review.js";
import { save } from "../../src/core/tasks/files.js";
import { finalReviewPath } from "../../src/core/tasks/paths.js";
import { readChangePlan } from "../../src/core/tasks/plan-ready.js";
import { planDigest, planTaskTexts, readPlanState, writePlanState } from "../../src/core/tasks/plan-state.js";
import { listTaskRecords, writeTaskRecord } from "../../src/core/tasks/records.js";
import { writeWorkflowFile } from "../../src/core/tasks/workflow-file.js";
import { git } from "./git-workspace.js";

/**
 * Brings a change written straight to disk to the state the 6.0.0 commands
 * leave behind, so a verify test checks only its own dimension: workflow 3,
 * the change branch at HEAD (not checked out), the plan approved at HEAD, a
 * closed and reviewed record for every ticked task and an approved final
 * review of HEAD. The trace base stays HEAD, the commit that added the change
 * directory; work written after it goes in through `commitWork`.
 */
export function sealForVerify(root: string, change: string): void {
  writeWorkflowFile(root, change, { version: 3, schema: "spec-driven", schemaVersion: 1, path: "full" });
  const head = git(root, "rev-parse", "HEAD");
  git(root, "branch", "--force", featureBranchName(change), head);
  const at = new Date().toISOString();
  const state = readPlanState(root, change);
  state.approval = {
    quote: "да",
    digest: planDigest(root, change),
    base: head,
    taskTexts: planTaskTexts(root, change),
    at,
  };
  writePlanState(root, change, state);
  const run = { commit: head, exitCode: 0, tail: "", log: "", at };
  for (const task of readChangePlan(root, change).tasks.filter((t) => t.done && t.number !== "")) {
    writeTaskRecord(root, change, {
      id: task.number,
      origin: "native",
      executor: `exec-${task.number}`,
      branch: `task/${change}/${task.number}`,
      worktree: "",
      base: head,
      startedAt: at,
      red: { ...run, exitCode: 1 },
      green: run,
      reviews: [{ reviewer: `rev-${task.number}`, verdict: "approved", green: head, controls: [], findings: [], at }],
      closed: { merge: head, at },
      attempts: 1,
    });
  }
  save(finalReviewPath(root, change), {
    version: 1,
    reviews: [{ reviewer: "final-1", verdict: "approved", head, base: head, findings: [], at }],
  });
}

/**
 * Commits the work a test wrote outside the change directory on the current branch and
 * moves the change branch to that commit, the way task close leaves the work:
 * the records, their reviews and the final review all name the new tip.
 */
export function commitWork(root: string, change: string): void {
  git(root, "add", "--all", "--", ".", `:(exclude)lexforge/changes/${change}`);
  git(root, "commit", "--allow-empty", "--message", "work of the change");
  const tip = git(root, "rev-parse", "HEAD");
  const branch = featureBranchName(change);
  if (git(root, "branch", "--show-current") !== branch) git(root, "branch", "--force", branch, tip);
  for (const record of listTaskRecords(root, change)) {
    if (record.green === null || record.closed === null) continue;
    writeTaskRecord(root, change, {
      ...record,
      green: { ...record.green, commit: tip },
      reviews: record.reviews.map((review) => ({ ...review, green: tip })),
      closed: { ...record.closed, merge: tip },
    });
  }
  const reviews = readFinalReviews(root, change).map((review) => ({ ...review, head: tip }));
  if (reviews.length > 0) save(finalReviewPath(root, change), { version: 1, reviews });
}
