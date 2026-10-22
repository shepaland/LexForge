import { existsSync } from "node:fs";
import path from "node:path";
import { UsageError } from "../../cli/errors.js";
import { diffFiles, isAncestor } from "../git/task-worktree.js";
import { writeReviewPackage } from "./brief.js";
import type { PlanTask } from "../gates/task-list.js";
import { saveText } from "./files.js";
import { withChangeLock } from "./lock.js";
import { taskArtifactPath } from "./paths.js";
import { findPlanTask } from "./plan-ready.js";
import { writeTaskRecord, type RunRecord, type TaskRecord } from "./records.js";
import { classifyRed, runTaskCommand, type CommandRun } from "./run.js";
import {
  assertRecordUnchanged,
  assertWorktreeClean,
  commandOf,
  headOf,
  requireInProgress,
  taskCommand,
} from "./task-guards.js";

export interface RedResult {
  commit: string;
  exitCode: number;
  tail: string;
  nextStep: string;
}

/** Writes the full output next to the record and returns the run as the record keeps it. */
export function keepRun(root: string, change: string, taskId: string, name: "red.log" | "green.log", commit: string, run: CommandRun): RunRecord {
  const file = taskArtifactPath(root, change, taskId, name);
  saveText(file, run.log);
  return {
    commit,
    exitCode: run.exitCode,
    tail: run.tail,
    log: path.relative(root, file).split(path.sep).join("/"),
    at: new Date().toISOString(),
  };
}

function checkRedCommit(record: TaskRecord, task: PlanTask, change: string): string {
  const commit = headOf(record.worktree);
  const changed = diffFiles(record.worktree, record.base, commit);
  if (changed.length === 0) {
    throw new UsageError(
      "red-commit-missing",
      `the worktree of task ${task.number} has no commit on top of its base.`,
      `commit the test alone in the worktree, then run: ${taskCommand("red", change, task.number)}`,
    );
  }
  const code = changed.filter((file) => !task.tests.includes(file));
  if (code.length > 0) {
    throw new UsageError(
      "red-commit-touches-code",
      `the commits of task ${task.number} before red touch files outside its Test: line: ${code.join(", ")}.`,
      taskCommand("abandon", change, task.number),
    );
  }
  return commit;
}

/** Runs the task's command on the test commit and records it as red when it fails for the right reason. */
export function recordRed(root: string, change: string, taskId: string): RedResult {
  const task = findPlanTask(root, change, taskId);
  if (task.declaresMove) {
    throw new UsageError(
      "move-task-needs-no-red",
      `task ${taskId} is a (move) task: it changes no behaviour, so no test can fail first.`,
      taskCommand("green", change, taskId),
    );
  }
  const before = withChangeLock(root, change, "task red", () => {
    const record = requireInProgress(root, change, taskId);
    assertWorktreeClean(record.worktree, taskId);
    return { record, commit: checkRedCommit(record, task, change) };
  });

  const run = runTaskCommand(before.record.worktree, commandOf(task, change));
  const verdict = classifyRed(run, { cwd: before.record.worktree, base: before.record.base, declaredFiles: task.files });
  if (verdict.kind === "passed") {
    throw new UsageError(
      "red-run-passed",
      `the command of task ${taskId} passed on the test commit, so the test does not pin the missing behaviour.`,
      `make the test fail on the missing behaviour, commit it, then run: ${taskCommand("red", change, taskId)}`,
    );
  }
  if (verdict.kind === "broken") {
    throw new UsageError(
      "red-run-broken",
      `the command of task ${taskId} failed before reaching the test: ${verdict.reason}.\n${run.tail}`,
      verdict.cause === "undeclared-module"
        ? `lexforge plan amend --change ${change} --quote "<owner's words>"`
        : `set worktree.setup in lexforge/config.yaml, then run: ${taskCommand("abandon", change, taskId)}`,
    );
  }

  return withChangeLock(root, change, "task red", () => {
    const record = assertRecordUnchanged(root, change, before.record, "red");
    if (headOf(record.worktree) !== before.commit) {
      throw new UsageError("task-record-changed", `the worktree of task ${taskId} moved while its command ran.`, taskCommand("red", change, taskId));
    }
    const red = keepRun(root, change, taskId, "red.log", before.commit, run);
    writeTaskRecord(root, change, { ...record, red, green: null });
    return {
      commit: before.commit,
      exitCode: run.exitCode,
      tail: run.tail,
      nextStep: `commit the implementation, then run: ${taskCommand("green", change, taskId)}`,
    };
  });
}

export interface GreenResult {
  commit: string;
  reviewPackage: string;
  nextStep: string;
}

function reportPath(change: string, taskId: string): string {
  return `${path.posix.join("lexforge/changes", change, "tasks", taskId, "report.md")}`;
}

/** Checks, in order, what must hold before the green run: red, its place in history, the tests, the tree, the report. */
function checkGreenCommit(root: string, change: string, task: PlanTask, record: TaskRecord): string {
  const taskId = task.number;
  if (record.red === null && !task.declaresMove) {
    throw new UsageError("red-missing", `task ${taskId} has no red run recorded.`, taskCommand("red", change, taskId));
  }
  const commit = headOf(record.worktree);
  if (record.red !== null && !isAncestor(record.worktree, record.red.commit, commit)) {
    throw new UsageError(
      "red-not-ancestor",
      `the red commit ${record.red.commit.slice(0, 12)} of task ${taskId} is no longer in the history of its worktree.`,
      taskCommand("abandon", change, taskId),
    );
  }
  const since = record.red?.commit ?? record.base;
  const tests = diffFiles(record.worktree, since, commit).filter((file) => task.tests.includes(file));
  if (tests.length > 0) {
    throw new UsageError(
      "test-changed-after-red",
      `task ${taskId} changed ${tests.join(", ")} after its red run, so the red no longer pins the test that passes.`,
      taskCommand("red", change, taskId),
    );
  }
  assertWorktreeClean(record.worktree, taskId);
  if (!existsSync(taskArtifactPath(root, change, taskId, "report.md"))) {
    throw new UsageError(
      "executor-report-missing",
      `task ${taskId} has no executor report: what was done, what was checked, what is in doubt.`,
      `write ${reportPath(change, taskId)}, then run: ${taskCommand("green", change, taskId)}`,
    );
  }
  return commit;
}

/** Runs the task's command on the implementation commit, records it as green and writes the review package. */
export function recordGreen(root: string, change: string, taskId: string): GreenResult {
  const task = findPlanTask(root, change, taskId);
  const before = withChangeLock(root, change, "task green", () => {
    const record = requireInProgress(root, change, taskId);
    return { record, commit: checkGreenCommit(root, change, task, record) };
  });

  const run = runTaskCommand(before.record.worktree, commandOf(task, change));
  if (run.exitCode !== 0) {
    throw new UsageError(
      "green-run-failed",
      `the command of task ${taskId} exited ${run.exitCode} on ${before.commit.slice(0, 12)}:\n${run.tail}`,
      `fix the implementation in the worktree, commit it, then run: ${taskCommand("green", change, taskId)}`,
    );
  }

  return withChangeLock(root, change, "task green", () => {
    const record = assertRecordUnchanged(root, change, before.record, "green");
    if (headOf(record.worktree) !== before.commit) {
      throw new UsageError("task-record-changed", `the worktree of task ${taskId} moved while its command ran.`, taskCommand("green", change, taskId));
    }
    const updated = { ...record, green: keepRun(root, change, taskId, "green.log", before.commit, run) };
    writeTaskRecord(root, change, updated);
    const reviewPackage = writeReviewPackage(root, change, task, updated);
    const relative = path.relative(root, reviewPackage).split(path.sep).join("/");
    return {
      commit: before.commit,
      reviewPackage,
      nextStep: `send ${relative} to a reviewer, then run: ${taskCommand("review", change, taskId)} --file <report.md>`,
    };
  });
}
