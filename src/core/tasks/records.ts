import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { UsageError } from "../../cli/errors.js";
import { readJson, save } from "./files.js";
import { taskRecordPath } from "./paths.js";

const CODE = "task-record-unreadable";

const Control = z.enum(["authorization", "cryptography", "tenant-isolation", "migrations"]);

const Run = z
  .object({
    commit: z.string(),
    exitCode: z.number().int(),
    tail: z.string(),
    log: z.string(),
    at: z.string(),
  })
  .strict();

/** A review finding. The validation `Finding` of src/core/validation has another shape (file, line, rule). */
export const FindingSchema = z
  .object({ id: z.string(), level: z.enum(["critical", "important", "minor"]), message: z.string() })
  .strict();

const Review = z
  .object({
    reviewer: z.string(),
    verdict: z.enum(["approved", "changes-requested"]),
    green: z.string(),
    controls: z.array(Control),
    findings: z.array(FindingSchema),
    at: z.string(),
  })
  .strict();

export const TaskRecordSchema = z
  .object({
    id: z.string().regex(/^\d+(\.\d+)+$/),
    origin: z.enum(["native", "historical"]),
    executor: z.string(),
    branch: z.string(),
    worktree: z.string(),
    base: z.string(),
    startedAt: z.string(),
    red: Run.nullable(),
    green: Run.nullable(),
    reviews: z.array(Review),
    closed: z.object({ merge: z.string(), at: z.string() }).strict().nullable(),
    attempts: z.number().int(),
  })
  .strict();

export type RunRecord = z.infer<typeof Run>;
export type Finding = z.infer<typeof FindingSchema>;
export type TaskReview = z.infer<typeof Review>;
export type TaskRecord = z.infer<typeof TaskRecordSchema>;

export function readTaskRecord(root: string, change: string, id: string): TaskRecord | null {
  const file = taskRecordPath(root, change, id);
  if (!existsSync(file)) return null;
  return readJson(file, TaskRecordSchema, CODE);
}

export function writeTaskRecord(root: string, change: string, record: TaskRecord): void {
  save(taskRecordPath(root, change, record.id), TaskRecordSchema.parse(record));
}

function compareIds(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? -1) - (right[i] ?? -1);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function listTaskRecords(root: string, change: string): TaskRecord[] {
  const dir = path.dirname(taskRecordPath(root, change, "0.0"));
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const id = name.slice(0, -".json".length);
      const found = readTaskRecord(root, change, id)!;
      if (found.id !== id)
        throw new UsageError(
          CODE,
          `${taskRecordPath(root, change, id)} holds the record of task ${found.id}, not ${id}.`,
          `lexforge resume --change ${change}`,
        );
      return found;
    })
    .sort((a, b) => compareIds(a.id, b.id));
}
