import { existsSync } from "node:fs";
import { UsageError } from "../../cli/errors.js";
import { readGit } from "../git/repository.js";
import type { PlanTask } from "../gates/task-list.js";
import { startCommand } from "./plan-ready.js";
import { readTaskRecord, type TaskRecord } from "./records.js";

export function taskCommand(verb: string, change: string, taskId: string): string {
  return `lexforge task ${verb} --change ${change} --task ${taskId}`;
}

/** The record of a task in progress: started, not abandoned, not closed. */
export function requireInProgress(root: string, change: string, taskId: string): TaskRecord {
  const record = readTaskRecord(root, change, taskId);
  if (record !== null && record.closed !== null) {
    throw new UsageError("task-already-closed", `task ${taskId} is closed.`, `lexforge status --change ${change}`);
  }
  if (record === null || record.executor === "" || !existsSync(record.worktree)) {
    throw new UsageError(
      "task-not-started",
      `task ${taskId} has no worktree in progress.`,
      record !== null && record.executor !== "" ? taskCommand("abandon", change, taskId) : startCommand(change, taskId),
    );
  }
  return record;
}

export function headOf(worktree: string): string {
  return readGit(worktree, ["rev-parse", "HEAD"]);
}

/** Refuses while the worktree holds changes git has not committed. */
export function assertWorktreeClean(worktree: string, taskId: string): void {
  const status = readGit(worktree, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status !== "") {
    throw new UsageError(
      "worktree-dirty",
      `the worktree of task ${taskId} holds uncommitted changes:\n${status}`,
      `git -C ${worktree} status`,
    );
  }
}

/** The command the task runs, or a refusal: a task without `Command:` cannot be run. */
export function commandOf(task: PlanTask, change: string): string {
  if (task.command === null) {
    throw new UsageError(
      "task-command-missing",
      `task ${task.number} has no Command: line, so there is nothing to run.`,
      `lexforge plan amend --change ${change} --quote "<owner's words>"`,
    );
  }
  return task.command;
}

/** Refuses when the record changed while the command ran outside the lock. */
export function assertRecordUnchanged(root: string, change: string, before: TaskRecord, verb: string): TaskRecord {
  const now = readTaskRecord(root, change, before.id);
  if (now === null || JSON.stringify(now) !== JSON.stringify(before)) {
    throw new UsageError(
      "task-record-changed",
      `the record of task ${before.id} changed while its command ran.`,
      taskCommand(verb, change, before.id),
    );
  }
  return now;
}
