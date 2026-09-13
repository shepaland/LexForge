import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { UsageError } from "../../cli/errors.js";
import { answerPath } from "../answer-path.js";
import { workspacePaths } from "../workspace/paths.js";

/** Name of the store inside the change directory. */
export const RED_RUNS_FILE = "red-runs.json";

/**
 * The record of one task's failing run, as it is kept on disk. The shape
 * matches a label stamp field for field: a red record answers what this
 * task's test did before its implementation existed, not what the whole tree
 * did at a wave boundary, so it lives in its own file, keyed by task id.
 */
export interface RedRunRecord {
  /** The command the CLI ran itself. */
  command: string;
  exitCode: number;
  /** Start of the run, UTC, ISO 8601. */
  startedAt: string;
  durationMs: number;
  /** The commit the working tree stood on. */
  head: string;
  /** Digest of the working tree, `sha256:` and the hex digits. */
  worktreeDigest: string;
  /** End of the combined output of the run. */
  outputTail: string;
  outputTruncated: boolean;
}

/** The whole store of a change: one last record per task id. */
export interface RedRunStore {
  outputVersion: 1;
  records: Record<string, RedRunRecord>;
}

/** Every field of a record is required: a half-written record proves nothing. */
const RedRunRecordSchema = z.object({
  command: z.string(),
  exitCode: z.number().int(),
  startedAt: z.string(),
  durationMs: z.number().int(),
  head: z.string(),
  worktreeDigest: z.string(),
  outputTail: z.string(),
  outputTruncated: z.boolean(),
});

const RedRunStoreSchema = z.object({
  outputVersion: z.literal(1),
  records: z.record(z.string(), RedRunRecordSchema),
});

/** Where the red-run store of a change lives. */
export function redRunFile(root: string, change: string): string {
  return path.join(workspacePaths(root).changeDir(change), RED_RUNS_FILE);
}

/** An empty store: what a change with no red run yet has. */
export function emptyRedRuns(): RedRunStore {
  return { outputVersion: 1, records: {} };
}

/** Reads the store. A change with no red run yet has no file, and that is not an error. */
export function readRedRuns(root: string, change: string): RedRunStore {
  const file = redRunFile(root, change);

  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return emptyRedRuns();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw broken(file, (error as Error).message);
  }

  const result = RedRunStoreSchema.safeParse(parsed);
  if (!result.success) {
    throw broken(
      file,
      result.error.issues
        .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
        .join("; "),
    );
  }

  return result.data;
}

/**
 * A store that does not read as a store stops the command. Overwriting it
 * would be the easy way out, and it loses somebody else's record: the file
 * breaks on a merge conflict, and only a person can tell which run counts.
 */
function broken(file: string, detail: string): UsageError {
  const shown = answerPath(file);

  return new UsageError(
    "red-runs-broken",
    `${shown} is not a readable red-run store: ${detail}. ` +
      "No record is read or written until the file is sound again.",
    `open ${shown}, resolve the conflict by hand, then run this command again`,
  );
}

/**
 * Writes the store whole. The text goes into a temporary file next to the
 * target and is renamed over it: an interrupted write leaves the old store
 * in place rather than a stump.
 */
function writeRedRuns(root: string, change: string, store: RedRunStore): void {
  const file = redRunFile(root, change);
  mkdirSync(path.dirname(file), { recursive: true });

  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(stableStore(store), null, 2)}\n`, "utf8");
  renameSync(temporary, file);
}

/**
 * The store with its task ids in alphabetical order and every record written
 * field by field in one order. The file goes into a commit, so the same store
 * has to give the same bytes: a merge then touches only the task that moved.
 */
function stableStore(store: RedRunStore): RedRunStore {
  const records: Record<string, RedRunRecord> = {};

  for (const task of Object.keys(store.records).sort()) {
    const record = store.records[task]!;
    records[task] = {
      command: record.command,
      exitCode: record.exitCode,
      startedAt: record.startedAt,
      durationMs: record.durationMs,
      head: record.head,
      worktreeDigest: record.worktreeDigest,
      outputTail: record.outputTail,
      outputTruncated: record.outputTruncated,
    };
  }

  return { outputVersion: 1, records };
}

/**
 * Replaces the record of one task and writes the store back. Records of other
 * tasks are carried over as they were read.
 */
export function putRedRun(
  root: string,
  change: string,
  task: string,
  record: RedRunRecord,
): RedRunStore {
  const store = readRedRuns(root, change);
  const next: RedRunStore = {
    outputVersion: 1,
    records: { ...store.records, [task]: record },
  };

  writeRedRuns(root, change, next);
  return next;
}
