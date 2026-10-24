import path from "node:path";
import { UsageError } from "../../cli/errors.js";
import { workspacePath } from "../answer-path.js";
import { featureBranchName } from "../git/feature-branch.js";
import { tryGit } from "../git/repository.js";
import { isAncestor } from "../git/task-worktree.js";
import { finalReviewClears, readFinalReviews } from "../tasks/final-review.js";
import { changeDir, finalReviewPath } from "../tasks/paths.js";
import { readChangePlan } from "../tasks/plan-ready.js";
import { readPlanState } from "../tasks/plan-state.js";
import { listTaskRecords, type TaskRecord } from "../tasks/records.js";
import { isShortPath, shortPathProblems } from "../tasks/short-path.js";
import { makeFinding, type Finding } from "../validation/finding.js";
import type { PlanTask } from "./task-list.js";

export const TICKED_WITHOUT_RECORD = "ticked-task-without-record";
export const RECORD_NOT_CLOSED = "task-record-not-closed";
export const COMMIT_MISSING = "recorded-commit-missing";
export const FINAL_MISSING = "final-review-missing";
export const FINAL_STALE = "final-review-stale";
export const FINAL_OPEN = "final-review-findings-open";
export const SHORT_PATH_OUTGROWN = "short-path-not-eligible";

/** The tip of the change branch; verify has nothing to compare the records with without it. */
function branchTip(root: string, change: string): string {
  const branch = featureBranchName(change);
  const tip = tryGit(root, ["rev-parse", "--verify", `${branch}^{commit}`]);
  if (!tip.ok) {
    throw new UsageError(
      "change-branch-missing",
      `change "${change}" has no branch ${branch}, so its task records have nothing to be checked against.`,
      `git branch ${branch} <the commit the change was built on>, then run: lexforge verify --change ${change}`,
    );
  }
  return tip.output.trim();
}

/** The commits a native record names: red, green and the merge into the change branch. */
function recordedCommits(record: TaskRecord): [string, string][] {
  const named: [string, string | undefined][] = [
    ["red", record.red?.commit],
    ["green", record.green?.commit],
    ["merge", record.closed?.merge],
  ];
  return named.filter((pair): pair is [string, string] => pair[1] !== undefined);
}

function recordFinding(
  root: string,
  change: string,
  task: PlanTask,
  record: TaskRecord | undefined,
  migrated: boolean,
  tip: string,
): Finding | undefined {
  const file = workspacePath(root, task.file);
  const at = (rule: string, message: string): Finding => makeFinding(file, task.line, rule, message);
  if (record === undefined) {
    return at(
      TICKED_WITHOUT_RECORD,
      `Task ${task.number} is ticked, and no task record backs it: the box was ticked by hand, past task close.`,
    );
  }
  if (record.origin === "historical") {
    if (migrated) return undefined;
    return at(
      RECORD_NOT_CLOSED,
      `Task ${task.number} holds a historical record, and the plan was not migrated from 5.x, ` +
        "so nothing closed it.",
    );
  }
  if (record.closed === null) {
    return at(RECORD_NOT_CLOSED, `Task ${task.number} is ticked, and its record was never closed by task close.`);
  }
  const missing = recordedCommits(record).filter(([, commit]) => !isAncestor(root, commit, tip));
  if (missing.length === 0) return undefined;
  return at(
    COMMIT_MISSING,
    `Task ${task.number} records ${missing.map(([what, commit]) => `${what} ${commit.slice(0, 12)}`).join(", ")}, ` +
      `and ${featureBranchName(change)} no longer holds them: the branch was rewritten after the task closed.`,
  );
}

/** The final review dimension; it runs once every checkbox of the plan is ticked. */
function finalReviewFindings(root: string, change: string, tip: string, commitsMissing: boolean): Finding[] {
  const file = workspacePath(root, finalReviewPath(root, change));
  const at = (rule: string, message: string): Finding[] => [makeFinding(file, 1, rule, message)];
  const last = readFinalReviews(root, change).at(-1);
  if (last === undefined) {
    return at(FINAL_MISSING, `Every task of change "${change}" is closed, and no final review is registered.`);
  }
  if (!commitsMissing && last.head !== tip) {
    return at(
      FINAL_STALE,
      `The last final review saw ${featureBranchName(change)} at ${last.head.slice(0, 12)}; ` +
        `the branch has moved to ${tip.slice(0, 12)} since.`,
    );
  }
  if (!finalReviewClears(last)) {
    const blocking = last.findings.filter((f) => f.level !== "minor").length;
    return at(
      FINAL_OPEN,
      `The last final review, by ${last.reviewer}, is ${last.verdict} with ${blocking} critical or important finding(s).`,
    );
  }
  return [];
}

function shortPathFindings(root: string, change: string, planFile: string): Finding[] {
  if (!isShortPath(root, change)) return [];
  const problems = shortPathProblems(root, change);
  if (problems.length === 0) return [];
  return [
    makeFinding(
      planFile,
      1,
      SHORT_PATH_OUTGROWN,
      `Change "${change}" runs on the short path and no longer fits it: ${problems.join("; ")}. ` +
        `Run: lexforge plan escalate --change ${change}`,
    ),
  ];
}

/**
 * What the task records and the final review say about a change: every ticked
 * box is backed by a closed record, every commit a native record names is
 * still on the change branch, and the last final review saw the current tip
 * and cleared it.
 */
export function taskFindings(root: string, change: string): Finding[] {
  const plan = readChangePlan(root, change);
  const tasks = plan.tasks.filter((task) => task.number !== "");
  const records = new Map(listTaskRecords(root, change).map((record) => [record.id, record]));
  const migrated = readPlanState(root, change).migratedFrom === "5.x";
  const tip = branchTip(root, change);
  const findings: Finding[] = [];
  for (const task of tasks.filter((t) => t.done)) {
    const finding = recordFinding(root, change, task, records.get(task.number), migrated, tip);
    if (finding !== undefined) findings.push(finding);
  }
  const planFile = workspacePath(root, path.join(root, changeDir(change), "tasks.md"));
  findings.push(...shortPathFindings(root, change, planFile));
  if (plan.tasks.every((task) => task.done)) {
    findings.push(...finalReviewFindings(root, change, tip, findings.some((f) => f.rule === COMMIT_MISSING)));
  }
  return findings;
}
