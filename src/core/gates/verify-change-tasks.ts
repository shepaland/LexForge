import path from "node:path";
import { UsageError } from "../../cli/errors.js";
import { workspacePath } from "../answer-path.js";
import { featureBranchName } from "../git/feature-branch.js";
import { tryGit } from "../git/repository.js";
import { isAncestor } from "../git/task-worktree.js";
import { assertReviewed } from "../tasks/close.js";
import {
  changeBranchTip,
  finalFindingsStep,
  finalPackageCommand,
  finalReviewClears,
  readFinalReviews,
} from "../tasks/final-review.js";
import { changeDir, finalReviewPath } from "../tasks/paths.js";
import { readChangePlan } from "../tasks/plan-ready.js";
import { amendCommand, readPlanState } from "../tasks/plan-state.js";
import { listTaskRecords, type TaskRecord } from "../tasks/records.js";
import { assertSpecsBeforeCode, isShortPath, shortPathProblems } from "../tasks/short-path.js";
import { makeFinding, type Finding } from "../validation/finding.js";
import type { PlanTask, PlanTasks } from "./task-list.js";

export const TICKED_WITHOUT_RECORD = "ticked-task-without-record";
export const RECORD_NOT_CLOSED = "task-record-not-closed";
export const COMMIT_MISSING = "recorded-commit-missing";
export const FINAL_MISSING = "final-review-missing";
export const FINAL_STALE = "final-review-stale";
export const FINAL_OPEN = "final-review-findings-open";
export const SHORT_PATH_OUTGROWN = "short-path-not-eligible";
export const SPECS_BEFORE_CODE = "specs-before-code";
export const NOT_REVIEWED = "task-not-reviewed";
export const UNCOMMITTED = "uncommitted-work";

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
): Finding[] {
  const file = workspacePath(root, task.file);
  const at = (rule: string, message: string): Finding[] => [makeFinding(file, task.line, rule, message)];
  if (record === undefined) {
    return at(
      TICKED_WITHOUT_RECORD,
      `Task ${task.number} is ticked, and no task record backs it: the box was ticked by hand, past task close.`,
    );
  }
  if (record.origin === "historical") {
    if (migrated) return [];
    return at(
      RECORD_NOT_CLOSED,
      `Task ${task.number} holds a historical record, and the plan was not migrated from 5.x, ` +
        "so nothing closed it.",
    );
  }
  if (record.closed === null) {
    return at(RECORD_NOT_CLOSED, `Task ${task.number} is ticked, and its record was never closed by task close.`);
  }
  const findings = reviewFinding(record, change, at);
  const missing = recordedCommits(record).filter(([, commit]) => !isAncestor(root, commit, tip));
  if (missing.length === 0) return findings;
  const branch = featureBranchName(change);
  return [
    ...findings,
    ...at(
      COMMIT_MISSING,
      `Task ${task.number} records ${missing.map(([what, commit]) => `${what} ${commit.slice(0, 12)}`).join(", ")}, ` +
        `and ${branch} no longer holds them: the branch was rewritten after the task closed. ` +
        `Put the commits back on ${branch} (git reflog show ${branch} names them), then run: lexforge verify --change ${change}`,
    ),
  ];
}

/**
 * A native record closed past its review: the last review is approved, written
 * by someone other than the executor, covers the green commit and leaves no
 * critical or important finding. The same rule task close enforces; a closed
 * task takes no new review, so the way out is a new task that redoes the work.
 */
function reviewFinding(
  record: TaskRecord,
  change: string,
  at: (rule: string, message: string) => Finding[],
): Finding[] {
  try {
    assertReviewed(record, change, record.green?.commit ?? "");
    return [];
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    return at(
      NOT_REVIEWED,
      `Task ${record.id} is closed, and ${error.message} ` +
        `Add a task that redoes task ${record.id} under review, then run: ${amendCommand(change)}`,
    );
  }
}

/** The final review dimension; it runs once every checkbox of the plan is ticked. */
function finalReviewFindings(root: string, change: string, tip: string, commitsMissing: boolean): Finding[] {
  const file = workspacePath(root, finalReviewPath(root, change));
  const at = (rule: string, message: string): Finding[] => [makeFinding(file, 1, rule, message)];
  const last = readFinalReviews(root, change).at(-1);
  if (last === undefined) {
    return at(
      FINAL_MISSING,
      `Every task of change "${change}" is closed, and no final review is registered. ` +
        `Run: ${finalPackageCommand(change)}`,
    );
  }
  if (!commitsMissing && last.head !== tip) {
    return at(
      FINAL_STALE,
      `The last final review saw ${featureBranchName(change)} at ${last.head.slice(0, 12)}; ` +
        `the branch has moved to ${tip.slice(0, 12)} since. Run: ${finalPackageCommand(change)}`,
    );
  }
  if (!finalReviewClears(last)) {
    const blocking = last.findings.filter((f) => f.level !== "minor").length;
    return at(
      FINAL_OPEN,
      `The last final review, by ${last.reviewer}, is ${last.verdict} with ${blocking} critical or important finding(s). ` +
        `Next: ${finalFindingsStep(change)}`,
    );
  }
  return [];
}

/**
 * The short path re-checked after red: the plan still fits it, and the delta
 * still passes validate --strict, the same rule task red enforces.
 */
function shortPathFindings(root: string, change: string, planFile: string): Finding[] {
  if (!isShortPath(root, change)) return [];
  const findings: Finding[] = [];
  const problems = shortPathProblems(root, change);
  if (problems.length > 0) {
    findings.push(
      makeFinding(
        planFile,
        1,
        SHORT_PATH_OUTGROWN,
        `Change "${change}" runs on the short path and no longer fits it: ${problems.join("; ")}. ` +
          `Run: lexforge plan escalate --change ${change}`,
      ),
    );
  }
  try {
    assertSpecsBeforeCode(root, change);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    findings.push(
      makeFinding(
        planFile,
        1,
        SPECS_BEFORE_CODE,
        `Change "${change}" runs on the short path, and ${error.message} Run: ${error.nextStep}`,
      ),
    );
  }
  return findings;
}

/**
 * Work outside lexforge/ that the working tree holds and the change branch
 * does not: no review saw it, and archive would commit it into dev with the
 * rest of the change.
 */
function uncommittedFindings(root: string, change: string, tip: string): Finding[] {
  const scope = ["--", ".", ":(exclude)lexforge", ":(exclude).lexforge"];
  const changed = tryGit(root, ["-c", "core.quotepath=off", "diff", "--name-only", tip, ...scope]);
  const untracked = tryGit(root, ["-c", "core.quotepath=off", "ls-files", "--others", "--exclude-standard", ...scope]);
  const files = [...new Set([changed, untracked].flatMap((run) => (run.ok ? run.output.split("\n") : [])))]
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (files.length === 0) return [];
  const branch = featureBranchName(change);
  return [
    makeFinding(
      workspacePath(root, finalReviewPath(root, change)),
      1,
      UNCOMMITTED,
      `The working tree differs from ${branch} at ${tip.slice(0, 12)} outside lexforge/: ${files.join(", ")}. ` +
        `No review saw these changes. Commit them on ${branch} or drop them, then run: ${finalPackageCommand(change)}`,
    ),
  ];
}

/**
 * The files a task is traced by. A historical task of a change migrated from
 * 5.x has no Files line, and 5.x traced it by the paths its text names in
 * backticks; the trace keeps reading them the same way.
 */
export function withHistoricalFiles(root: string, change: string, plan: PlanTasks): PlanTasks {
  if (readPlanState(root, change).migratedFrom !== "5.x") return plan;
  const records = new Map(listTaskRecords(root, change).map((record) => [record.id, record]));
  const tasks = plan.tasks.map((task) =>
    records.get(task.number)?.origin === "historical" && task.files.length === 0
      ? { ...task, files: task.namedFiles }
      : task,
  );
  return { ...plan, tasks };
}

/**
 * What the task records and the final review say about a change: every ticked
 * box is backed by a closed and reviewed record, every commit a native record
 * names is still on the change branch, the working tree holds no work the
 * branch lacks, and the last final review saw the current tip and cleared it.
 */
export function taskFindings(root: string, change: string): Finding[] {
  const plan = readChangePlan(root, change);
  const tasks = plan.tasks.filter((task) => task.number !== "");
  const records = new Map(listTaskRecords(root, change).map((record) => [record.id, record]));
  const migrated = readPlanState(root, change).migratedFrom === "5.x";
  const tip = changeBranchTip(root, change, `lexforge verify --change ${change}`);
  const findings: Finding[] = [];
  for (const task of tasks.filter((t) => t.done)) {
    findings.push(...recordFinding(root, change, task, records.get(task.number), migrated, tip));
  }
  const planFile = workspacePath(root, path.join(root, changeDir(change), "tasks.md"));
  findings.push(...shortPathFindings(root, change, planFile));
  findings.push(...uncommittedFindings(root, change, tip));
  if (plan.tasks.every((task) => task.done)) {
    findings.push(
      ...finalReviewFindings(
        root,
        change,
        tip,
        findings.some((f) => f.rule === COMMIT_MISSING),
      ),
    );
  }
  return findings;
}
