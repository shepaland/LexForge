import path from "node:path";
import { UsageError } from "../../cli/errors.js";
import { readPlanSource, type PlanSource } from "../gates/plan-source.js";
import type { PlanTask } from "../gates/task-list.js";
import { changeDir } from "./paths.js";
import { listTaskRecords, type TaskRecord } from "./records.js";

export type Readiness = "closed" | "in-progress" | "ready" | "waiting" | "blocked";

/** A dependency abandoned this many times blocks the tasks that wait for it. */
const BLOCKING_ATTEMPTS = 2;

export function readChangePlan(root: string, change: string): PlanSource {
  return readPlanSource(path.join(root, changeDir(change), "tasks.md"));
}

/** The task of the plan with this number, or `task-not-found`. */
export function findPlanTask(root: string, change: string, taskId: string): PlanTask {
  const task = readChangePlan(root, change).tasks.find((t) => t.number === taskId);
  if (task === undefined) {
    throw new UsageError(
      "task-not-found",
      `the plan of change "${change}" holds no task ${taskId}.`,
      `lexforge status --change ${change}`,
    );
  }
  return task;
}

/** Everything a task waits for: its own `Depends on:` and every task of the sections its section depends on. */
export function taskDependencies(source: PlanSource, taskId: string): string[] {
  const section = source.sections.find((s) => s.tasks.some((t) => t.number === taskId));
  const task = source.tasks.find((t) => t.number === taskId);
  const fromSections = (section?.dependsOn ?? []).flatMap(
    (number) => source.sections.find((s) => s.number === number)?.tasks.map((t) => t.number) ?? [],
  );
  return [...new Set([...(task?.dependsOn ?? []), ...fromSections])].filter((id) => id !== "" && id !== taskId);
}

/**
 * One rule for every command that asks whether a task may start. A ticked
 * checkbox or a closed record is closed. A record with an executor and no
 * close is in progress. An abandoned task keeps its record with an empty
 * executor and may start again. A task whose open dependency was abandoned
 * twice is blocked; one with any other open dependency waits.
 */
export function taskReadiness(root: string, change: string): Map<string, Readiness> {
  const source = readChangePlan(root, change);
  const records = new Map<string, TaskRecord>(listTaskRecords(root, change).map((r) => [r.id, r]));
  const closed = (id: string): boolean => {
    const task = source.tasks.find((t) => t.number === id);
    return (task?.done ?? false) || (records.get(id)?.closed ?? null) !== null;
  };
  const result = new Map<string, Readiness>();
  for (const task of source.tasks) {
    if (task.number === "") continue;
    const record = records.get(task.number);
    if (closed(task.number)) result.set(task.number, "closed");
    else if (record !== undefined && record.executor !== "") result.set(task.number, "in-progress");
    else {
      const open = taskDependencies(source, task.number).filter((id) => !closed(id));
      if (open.some((id) => (records.get(id)?.attempts ?? 0) >= BLOCKING_ATTEMPTS)) result.set(task.number, "blocked");
      else result.set(task.number, open.length > 0 ? "waiting" : "ready");
    }
  }
  return result;
}

/** The first task in plan order that may start now. */
export function firstReadyTask(root: string, change: string): string | null {
  for (const [id, state] of taskReadiness(root, change)) if (state === "ready") return id;
  return null;
}

export function startCommand(change: string, taskId: string): string {
  return `lexforge task start --change ${change} --task ${taskId} --executor <id>`;
}

/** The command that starts the first ready task, or the status command when none is ready. */
export function startNextStep(root: string, change: string): string {
  const id = firstReadyTask(root, change);
  return id === null ? `lexforge status --change ${change}` : startCommand(change, id);
}
