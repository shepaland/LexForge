import { existsSync, rmSync } from "node:fs";
import { UsageError } from "../../cli/errors.js";
import { readGit, tryGit } from "../git/repository.js";
import { withChangeLock } from "./lock.js";
import { taskDirPath } from "./paths.js";
import { findPlanTask, startCommand } from "./plan-ready.js";
import { readTaskRecord, writeTaskRecord } from "./records.js";

export interface AbandonResult {
  attempts: number;
  nextStep: string;
}

/** Removes the task's worktree and branch, clears its runs, reviews and executor, and counts the attempt. */
export function abandonTask(root: string, change: string, taskId: string): AbandonResult {
  findPlanTask(root, change, taskId);
  return withChangeLock(root, change, "task abandon", () => {
    const record = readTaskRecord(root, change, taskId);
    if (record !== null && record.closed !== null) {
      throw new UsageError("task-already-closed", `task ${taskId} is closed.`, `lexforge status --change ${change}`);
    }
    if (record === null || record.executor === "") {
      throw new UsageError("task-not-started", `task ${taskId} is not in progress.`, startCommand(change, taskId));
    }
    if (existsSync(record.worktree)) readGit(root, ["worktree", "remove", "--force", record.worktree]);
    readGit(root, ["worktree", "prune"]);
    if (tryGit(root, ["show-ref", "--verify", "--quiet", `refs/heads/${record.branch}`]).ok) {
      readGit(root, ["branch", "-D", record.branch]);
    }
    rmSync(taskDirPath(root, change, taskId), { recursive: true, force: true });
    const attempts = record.attempts + 1;
    writeTaskRecord(root, change, {
      ...record,
      executor: "",
      red: null,
      green: null,
      reviews: [],
      closed: null,
      attempts,
    });
    return { attempts, nextStep: startCommand(change, taskId) };
  });
}
