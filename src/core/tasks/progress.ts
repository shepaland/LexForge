import { readChangePlan, taskReadiness } from "./plan-ready.js";
import { listTaskRecords } from "./records.js";

export interface Counts {
  total: number;
  closed: number;
  inProgress: number;
  waiting: number;
  blocked: number;
}

export interface Progress extends Counts {
  sections: Array<{ name: string } & Counts>;
}

function empty(): Counts {
  return { total: 0, closed: 0, inProgress: 0, waiting: 0, blocked: 0 };
}

/** Share of closed tasks as a whole percent, rounded down. */
export function percentClosed(progress: Counts): number {
  return progress.total === 0 ? 0 : Math.floor((progress.closed * 100) / progress.total);
}

/**
 * Counts the tasks of the plan. A task is in progress when its record is open and names an executor
 * (an abandoned task has none); waiting and blocked come from `taskReadiness`, and ready tasks are in neither.
 */
export function computeProgress(root: string, change: string): Progress {
  const source = readChangePlan(root, change);
  const readiness = taskReadiness(root, change);
  const running = new Set(
    listTaskRecords(root, change)
      .filter((record) => record.closed === null && record.executor !== "")
      .map((record) => record.id),
  );
  const count = (counts: Counts, id: string): void => {
    const state = readiness.get(id);
    if (state === undefined) return;
    counts.total += 1;
    if (state === "closed") counts.closed += 1;
    else if (running.has(id)) counts.inProgress += 1;
    else if (state === "waiting") counts.waiting += 1;
    else if (state === "blocked") counts.blocked += 1;
  };

  const groups =
    source.sections.length > 0
      ? source.sections.map((section) => ({ name: section.number, ids: section.tasks.map((t) => t.number) }))
      : [{ name: "tasks", ids: source.tasks.map((t) => t.number) }];
  const total = empty();
  const sections = groups.map((group) => {
    const counts = empty();
    for (const id of group.ids) {
      count(counts, id);
      count(total, id);
    }
    return { name: group.name, ...counts };
  });
  return { ...total, sections };
}
