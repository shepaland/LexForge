import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { UsageError } from "../../cli/errors.js";
import type { Control, PlanTask } from "../gates/task-list.js";

/** The plan of cycles LexForge 5.x kept per change. Nothing but `lexforge migrate` reads it. */
export const EXECUTION_PLAN = "execution-plan.json";
/** The red-run store of LexForge 5.x: `{ records: { <task id>: ... } }`. */
export const RED_RUNS_FILE = "red-runs.json";
/** Where the files of the 5.x execution engine are put aside. */
export const ASIDE = "execution-5x";

const nonempty = z.string().trim().min(1);
const ref = z.object({ path: nonempty, heading: nonempty }).strict();
const CONTROL = z.enum(["authorization", "cryptography", "tenant-isolation", "migrations"]);

/** A cycle of `execution-plan.json` as 5.x wrote it, copied from the 5.x engine. */
const cycleSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    tasks: z.array(nonempty).min(1),
    mode: z.enum(["behavior", "move"]).default("behavior"),
    dependsOn: z.array(nonempty).default([]),
    files: z.array(z.object({ path: nonempty, symbols: z.array(nonempty).default([]) }).strict()).min(1),
    testFiles: z.array(nonempty).min(1),
    inputs: z.array(nonempty).default([]),
    environment: z.array(nonempty).default([]),
    command: nonempty,
    expectedFailure: nonempty,
    design: z.array(ref).default([]),
    acceptance: z.array(z.object({ id: nonempty, task: nonempty, description: nonempty }).strict()).min(1),
    controls: z.array(CONTROL).default([]),
  })
  .strict();

const planSchema = z.object({ version: z.literal(1), cycles: z.array(cycleSchema).min(1) }).strict();

export type ExecutionPlan = z.infer<typeof planSchema>;

/** What a cycle of 5.x says about one of its tasks, in the words of the 6.0.0 task fields. */
export interface CycleFields {
  /** The cycle the task belonged to. */
  cycle: string;
  files: string[];
  tests: string[];
  command: string;
  dependsOn: string[];
  controls: Control[];
}

/** Task id to the fields its cycle gives it. `Depends on:` holds the tasks of the cycles the cycle waited for. */
export function fieldsFromExecutionPlan(plan: ExecutionPlan): Map<string, CycleFields> {
  const tasksOf = new Map(plan.cycles.map((cycle) => [cycle.id, cycle.tasks]));
  const fields = new Map<string, CycleFields>();
  for (const cycle of plan.cycles) {
    const dependsOn = [...new Set(cycle.dependsOn.flatMap((id) => tasksOf.get(id) ?? []))];
    for (const task of cycle.tasks) {
      fields.set(task, {
        cycle: cycle.id,
        files: cycle.files.map((file) => file.path),
        tests: [...cycle.testFiles],
        command: cycle.command,
        dependsOn: dependsOn.filter((id) => id !== task),
        controls: [...cycle.controls],
      });
    }
  }
  return fields;
}

/** The first of the files that exists: 5.x kept them at the change root, `execution/` or, after a run, `execution-5x/`. */
function firstExisting(dir: string, name: string): string | null {
  for (const place of ["", "execution", ASIDE]) {
    const file = path.join(dir, place, name);
    if (existsSync(file)) return file;
  }
  return null;
}

function unreadable(file: string, why: string): UsageError {
  return new UsageError(
    "migration-source-unreadable",
    `${file} of LexForge 5.x cannot be read (${why}); nothing was written.`,
    `fix or remove ${file}, then run: lexforge migrate`,
  );
}

function readJsonFile(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw unreadable(file, error instanceof Error ? error.message : String(error));
  }
}

/** The plan of cycles of the change, or `null` when 5.x never wrote one. */
export function readExecutionPlan(dir: string): ExecutionPlan | null {
  const file = firstExisting(dir, EXECUTION_PLAN);
  if (file === null) return null;
  const parsed = planSchema.safeParse(readJsonFile(file));
  if (!parsed.success) throw unreadable(file, parsed.error.issues[0]?.message ?? "schema mismatch");
  return parsed.data;
}

/** Ids of the cycles whose `state.json` carries `closedAt`. */
export function readClosedCycles(dir: string): Set<string> {
  const closed = new Set<string>();
  for (const place of ["execution", ASIDE]) {
    const base = path.join(dir, place);
    if (!existsSync(base)) continue;
    for (const id of readdirSync(base)) {
      const file = path.join(base, id, "state.json");
      if (!existsSync(file)) continue;
      const state = readJsonFile(file) as { closedAt?: unknown } | null;
      if (typeof state?.closedAt === "string" && state.closedAt !== "") closed.add(id);
    }
  }
  return closed;
}

/** Task ids with a record in `red-runs.json`. The records themselves are not read. */
export function readRedRunTasks(dir: string): Set<string> {
  const file = firstExisting(dir, RED_RUNS_FILE);
  if (file === null) return new Set();
  const records = (readJsonFile(file) as { records?: unknown } | null)?.records;
  return new Set(records !== null && typeof records === "object" ? Object.keys(records) : []);
}

const TASK_HEAD = /^(\s*)-\s*\[( |x|X)\]\s*((?:\(move\)\s*)?)(\d+(?:\.\d+)+)\s*(.*)$/;
/** A group label of 5.x or the `(move)` mark, in whatever order they follow the number. */
const AFTER_NUMBER = /^(\[[A-Z][\w-]*\]|\(move\))(?:\s+|$)/;
const CONTINUATION = /^\s+\S/;
const ANY_TASK = /^\s*-\s*\[( |x|X)\]/;

const code = (items: string[]): string => items.map((item) => `\`${item}\``).join(", ");

/** The field lines a task lacks and its cycle can supply. */
function missingLines(task: PlanTask, cycle: CycleFields | undefined): string[] {
  if (cycle === undefined) return [];
  const lines: string[] = [];
  if (task.files.length === 0) {
    const named = cycle.files.filter((file) => task.namedFiles.includes(file));
    lines.push(`Files: ${code(named.length > 0 ? named : cycle.files)}`);
  }
  if (task.tests.length === 0) lines.push(`Test: ${code(cycle.tests)}`);
  if (task.command === null) lines.push(`Command: \`${cycle.command}\``);
  if (task.dependsOn === null && cycle.dependsOn.length > 0) lines.push(`Depends on: ${cycle.dependsOn.join(", ")}`);
  if (task.controls.length === 0 && cycle.controls.length > 0) lines.push(`Controls: ${cycle.controls.join(", ")}`);
  return lines;
}

/**
 * Rewrites the task lines of one plan file: the group labels out, `(move)`
 * right after the number, the tick as `ticked` says, and the field lines the
 * cycle supplies after the task's own continuation lines. Returns the new text.
 */
export function rewritePlanFile(
  text: string,
  tasks: PlanTask[],
  fields: Map<string, CycleFields>,
  ticked: (id: string) => boolean,
): string {
  const lines = text.split("\n");
  const byLine = new Map(tasks.map((task) => [task.line - 1, task]));
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const task = byLine.get(i);
    const head = task === undefined ? null : TASK_HEAD.exec(lines[i]!);
    if (task === undefined || head === null) {
      out.push(lines[i]!);
      continue;
    }
    const [, indent, , before, number] = head;
    let rest = head[5]!;
    let move = before!.trim() !== "";
    for (let mark = AFTER_NUMBER.exec(rest); mark !== null; mark = AFTER_NUMBER.exec(rest)) {
      if (mark[1] === "(move)") move = true;
      rest = rest.slice(mark[0].length);
    }
    out.push(`${indent}- [${ticked(number!) ? "x" : " "}] ${number}${move ? " (move)" : ""} ${rest}`.trimEnd());
    let end = i;
    while (end + 1 < lines.length && CONTINUATION.test(lines[end + 1]!) && !ANY_TASK.test(lines[end + 1]!)) end += 1;
    out.push(...lines.slice(i + 1, end + 1));
    const pad = end > i ? /^\s*/.exec(lines[end]!)![0] : `${indent}  `;
    out.push(...missingLines(task, fields.get(number!)).map((line) => pad + line));
    i = end;
  }
  return out.join("\n");
}
