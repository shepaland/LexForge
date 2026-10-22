import { existsSync, rmSync } from "node:fs";
import { UsageError } from "../../cli/errors.js";
import { tryGit } from "../git/repository.js";
import { createTaskWorktree, removeTaskWorktree } from "../git/task-worktree.js";
import type { PlanTask } from "../gates/task-list.js";
import { readProjectConfig } from "../workspace/project-config.js";
import { writeBrief } from "./brief.js";
import { withChangeLock } from "./lock.js";
import { taskBranchName, taskDirPath, taskRecordPath, taskWorktreePath } from "./paths.js";
import {
  findPlanTask,
  readChangePlan,
  startCommand,
  taskDependencies,
  taskReadiness,
  type Readiness,
} from "./plan-ready.js";
import { assertPlanApproved } from "./plan-state.js";
import { readTaskRecord, writeTaskRecord, type TaskRecord } from "./records.js";
import { runTaskCommand } from "./run.js";

export interface StartResult {
  worktree: string;
  branch: string;
  base: string;
  brief: string;
  nextStep: string;
}

function finishFirst(change: string, other: string, taskId: string): string {
  return `finish task ${other}, then run: ${startCommand(change, taskId)}`;
}

function assertDependenciesClosed(change: string, taskId: string, open: string[], states: Map<string, Readiness>): void {
  if (open.length === 0) return;
  const first = open[0]!;
  const state = states.get(first);
  const nextStep =
    state === "in-progress"
      ? finishFirst(change, first, taskId)
      : state === "ready"
        ? startCommand(change, first)
        : `lexforge status --change ${change}`;
  throw new UsageError(
    "task-dependencies-open",
    `task ${taskId} waits for task${open.length > 1 ? "s" : ""} ${open.join(", ")}, not closed yet.`,
    nextStep,
  );
}

function assertNoOverlap(root: string, change: string, task: PlanTask, states: Map<string, Readiness>): void {
  const mine = new Set([...task.files, ...task.tests]);
  for (const other of readChangePlan(root, change).tasks) {
    if (other.number === task.number || states.get(other.number) !== "in-progress") continue;
    const shared = [...new Set([...other.files, ...other.tests])].filter((file) => mine.has(file));
    if (shared.length > 0) {
      throw new UsageError(
        "task-files-overlap",
        `task ${task.number} and task ${other.number}, in progress, both touch ${shared.join(", ")}.`,
        finishFirst(change, other.number, task.number),
      );
    }
  }
}

/** Checks, in order, everything that must hold before a task gets its worktree. */
function assertStartable(root: string, change: string, taskId: string, executor: string): PlanTask {
  if (executor.trim() === "") {
    throw new UsageError("executor-missing", "task start needs the id of the executor.", startCommand(change, taskId));
  }
  const task = findPlanTask(root, change, taskId);
  const states = taskReadiness(root, change);
  const state = states.get(taskId);
  if (state === "closed" || state === "in-progress") {
    throw new UsageError(
      "task-already-started",
      `task ${taskId} is ${state === "closed" ? "closed" : "already in progress"}.`,
      `lexforge status --change ${change}`,
    );
  }
  assertPlanApproved(root, change);
  const open = taskDependencies(readChangePlan(root, change), taskId).filter((id) => states.get(id) !== "closed");
  assertDependenciesClosed(change, taskId, open, states);
  assertNoOverlap(root, change, task, states);
  const branch = taskBranchName(change, taskId);
  if (existsSync(taskWorktreePath(root, change, taskId)) || tryGit(root, ["rev-parse", "--verify", "--quiet", branch]).ok) {
    throw new UsageError(
      "task-worktree-exists",
      `the worktree or the branch ${branch} of task ${taskId} is left from an earlier attempt.`,
      `lexforge task abandon --change ${change} --task ${taskId}`,
    );
  }
  return task;
}

function restore(root: string, change: string, taskId: string, previous: TaskRecord | null): void {
  rmSync(taskDirPath(root, change, taskId), { recursive: true, force: true });
  if (previous === null) rmSync(taskRecordPath(root, change, taskId), { force: true });
  else writeTaskRecord(root, change, previous);
}

/** Opens the worktree of a task, records it as started and writes its brief. */
export function startTask(root: string, change: string, taskId: string, executor: string): StartResult {
  const opened = withChangeLock(root, change, "task start", () => {
    const task = assertStartable(root, change, taskId, executor);
    const previous = readTaskRecord(root, change, taskId);
    const tree = createTaskWorktree(root, change, taskId);
    writeTaskRecord(root, change, {
      id: taskId,
      origin: "native",
      executor: executor.trim(),
      branch: tree.branch,
      worktree: tree.path,
      base: tree.base,
      startedAt: new Date().toISOString(),
      red: null,
      green: null,
      reviews: [],
      closed: null,
      attempts: previous?.attempts ?? 0,
    });
    return { task, previous, tree, brief: writeBrief(root, change, task, tree.path) };
  });

  const setup = readProjectConfig(root).worktreeSetup;
  if (setup !== null) {
    const run = runTaskCommand(opened.tree.path, setup);
    if (run.exitCode !== 0) {
      withChangeLock(root, change, "task start", () => {
        removeTaskWorktree(root, opened.tree.path, opened.tree.branch);
        restore(root, change, taskId, opened.previous);
      });
      throw new UsageError(
        "worktree-setup-failed",
        `worktree.setup exited ${run.exitCode} in the worktree of task ${taskId}, so the worktree is removed:\n${run.tail}`,
        `fix worktree.setup in lexforge/config.yaml, then run: ${startCommand(change, taskId)}`,
      );
    }
  }

  const nextStep = opened.task.declaresMove
    ? `commit the move in the worktree, then run: lexforge task green --change ${change} --task ${taskId}`
    : `commit the test alone in the worktree, then run: lexforge task red --change ${change} --task ${taskId}`;
  return { worktree: opened.tree.path, branch: opened.tree.branch, base: opened.tree.base, brief: opened.brief, nextStep };
}
