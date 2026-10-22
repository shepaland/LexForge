import path from "node:path";
import { readPlanSource } from "../gates/plan-source.js";
import { changeDir } from "./paths.js";
import { listTaskRecords } from "./records.js";

/**
 * The first task in plan order that is not closed and waits for nothing: every
 * task it depends on is closed, and so is every task of the sections its own
 * section depends on. A ticked checkbox counts as closed, as a migrated plan has it.
 */
export function firstReadyTask(root: string, change: string): string | null {
  const source = readPlanSource(path.join(root, changeDir(change), "tasks.md"));
  const records = listTaskRecords(root, change);
  const closed = new Set(records.filter((r) => r.closed !== null).map((r) => r.id));
  const started = new Set(records.map((r) => r.id));
  for (const task of source.tasks) if (task.done && task.number !== "") closed.add(task.number);

  for (const section of source.sections) {
    const blocked = section.dependsOn.some((number) => {
      const needed = source.sections.find((other) => other.number === number);
      return needed !== undefined && needed.tasks.some((task) => !closed.has(task.number));
    });
    if (blocked) continue;
    const ready = section.tasks.find(
      (task) =>
        task.number !== "" &&
        !closed.has(task.number) &&
        !started.has(task.number) &&
        (task.dependsOn ?? []).every((id) => closed.has(id)),
    );
    if (ready) return ready.number;
  }
  return null;
}

/** The command that starts the first ready task, or the status command when none is ready. */
export function startNextStep(root: string, change: string): string {
  const id = firstReadyTask(root, change);
  return id === null
    ? `lexforge status --change ${change}`
    : `lexforge task start --change ${change} --task ${id} --executor <id>`;
}
