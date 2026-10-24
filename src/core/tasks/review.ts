import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { UsageError } from "../../cli/errors.js";
import { withChangeLock } from "./lock.js";
import { taskReviewCopyPath } from "./paths.js";
import { findPlanTask } from "./plan-ready.js";
import { assertReviewed } from "./close.js";
import { amendCommand, clearsAngle } from "./plan-state.js";
import { readTaskRecord, writeTaskRecord, type Finding, type TaskRecord } from "./records.js";
import { parseReviewReport, type ReviewReport } from "./review-report.js";
import { requireInProgress, taskCommand } from "./task-guards.js";

export interface TaskReviewResult {
  verdict: ReviewReport["verdict"];
  findings: Finding[];
  nextStep: string;
}

function reviewAgain(change: string, taskId: string): string {
  return `${taskCommand("review", change, taskId)} --file <report.md>`;
}

/** Reads the report; an unreadable one names the format and the command to run once it is rewritten. */
function readReport(file: string, change: string, taskId: string): ReviewReport {
  const again = `rewrite ${file} in the report format, then run: ${reviewAgain(change, taskId)}`;
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    throw new UsageError(
      "review-report-unreadable",
      `${file} cannot be read: ${(error as NodeJS.ErrnoException).code ?? "read error"}.`,
      `write the report to ${file}, then run: ${reviewAgain(change, taskId)}`,
    );
  }
  try {
    return parseReviewReport(text, file);
  } catch (error) {
    if (error instanceof UsageError) throw new UsageError(error.code, error.message, again, file);
    throw error;
  }
}

/** Whether a closed native record lacks the approved review task close requires of its green commit. */
function closedWithoutReview(record: TaskRecord | null, change: string): record is TaskRecord {
  if (record === null || record.closed === null || record.origin === "historical") return false;
  try {
    assertReviewed(record, change, record.green?.commit ?? "");
    return false;
  } catch (error) {
    if (error instanceof UsageError) return true;
    throw error;
  }
}

/**
 * The record a review is registered on: a task in progress, or a closed task
 * whose record carries no approved review of its green commit, which verify
 * finds and only a review can clear. A closed task already reviewed is refused.
 */
function reviewableRecord(root: string, change: string, taskId: string): { record: TaskRecord; closed: boolean } {
  const record = readTaskRecord(root, change, taskId);
  if (closedWithoutReview(record, change)) return { record, closed: true };
  return { record: requireInProgress(root, change, taskId), closed: false };
}

function nextAfterReview(report: ReviewReport, change: string, taskId: string, closed: boolean): string {
  if (closed) {
    return clearsAngle(report)
      ? `lexforge verify --change ${change}`
      : `add a task that fixes the findings of task ${taskId}, then run: ${amendCommand(change)}; once that task is closed, send lexforge/changes/${change}/tasks/${taskId}/review.md to a reviewer again and run: ${reviewAgain(change, taskId)}`;
  }
  return clearsAngle(report)
    ? taskCommand("close", change, taskId)
    : `fix the findings in the worktree, commit, run: ${taskCommand("green", change, taskId)}`;
}

/** Registers a reviewer's report against the current green commit of a task. */
export function registerTaskReview(root: string, change: string, taskId: string, file: string): TaskReviewResult {
  const task = findPlanTask(root, change, taskId);
  const reportFile = path.resolve(file);
  const report = readReport(reportFile, change, taskId);
  return withChangeLock(root, change, "task review", () => {
    const { record, closed } = reviewableRecord(root, change, taskId);
    if (record.green === null) {
      throw new UsageError("green-missing", `task ${taskId} has no green run to review.`, taskCommand("green", change, taskId));
    }
    if (report.reviewer.trim() === record.executor) {
      throw new UsageError(
        "reviewer-is-executor",
        `the report is signed by ${record.executor}, who carried out task ${taskId}.`,
        `send lexforge/changes/${change}/tasks/${taskId}/review.md to another reviewer, then run: ${reviewAgain(change, taskId)}`,
      );
    }
    const unchecked = task.controls.filter((control) => !report.controls.includes(control));
    if (report.verdict === "approved" && unchecked.length > 0) {
      throw new UsageError(
        "control-not-confirmed",
        `task ${taskId} names the control${unchecked.length > 1 ? "s" : ""} ${unchecked.join(", ")}, and the report does not confirm it.`,
        `check ${unchecked.join(", ")}, then run: ${reviewAgain(change, taskId)}`,
      );
    }
    const copy = taskReviewCopyPath(root, change, taskId, record.reviews.length + 1);
    mkdirSync(path.dirname(copy), { recursive: true });
    copyFileSync(reportFile, copy);
    writeTaskRecord(root, change, {
      ...record,
      reviews: [
        ...record.reviews,
        {
          reviewer: report.reviewer.trim(),
          verdict: report.verdict,
          green: record.green.commit,
          controls: report.controls,
          findings: report.findings,
          at: new Date().toISOString(),
        },
      ],
    });
    return { verdict: report.verdict, findings: report.findings, nextStep: nextAfterReview(report, change, taskId, closed) };
  });
}
