import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { UsageError } from "../../cli/errors.js";
import { answerPath } from "../answer-path.js";
import { workspacePaths } from "../workspace/paths.js";

/** Name of the ledger inside the change directory. */
export const EVIDENCE_FILE = "evidence.json";

/** One run of one check label, as it is kept on disk. */
export interface EvidenceRecord {
  /** The command that was run, copied from the `verification` section. */
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

/** The whole ledger of a change: one last record per label. */
export interface EvidenceLedger {
  outputVersion: 1;
  records: Record<string, EvidenceRecord>;
}

/** Every field of a record is required: a half-written stamp proves nothing. */
const EvidenceRecordSchema = z.object({
  command: z.string(),
  exitCode: z.number().int(),
  startedAt: z.string(),
  durationMs: z.number().int(),
  head: z.string(),
  worktreeDigest: z.string(),
  outputTail: z.string(),
  outputTruncated: z.boolean(),
});

const EvidenceLedgerSchema = z.object({
  outputVersion: z.literal(1),
  records: z.record(z.string(), EvidenceRecordSchema),
});

/** Where the ledger of a change lives. */
export function evidenceFile(root: string, change: string): string {
  return path.join(workspacePaths(root).changeDir(change), EVIDENCE_FILE);
}

/** An empty ledger: what a change without a single run has. */
export function emptyLedger(): EvidenceLedger {
  return { outputVersion: 1, records: {} };
}

/** Reads the ledger. A change with no runs yet has no file, and that is not an error. */
export function readLedger(root: string, change: string): EvidenceLedger {
  const file = evidenceFile(root, change);

  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return emptyLedger();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw broken(file, (error as Error).message);
  }

  const result = EvidenceLedgerSchema.safeParse(parsed);
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
 * A ledger that does not read as a ledger stops the command. Overwriting it
 * would be the easy way out, and it loses somebody else's stamp: the file
 * breaks on a merge conflict, and only a person can tell which run counts.
 */
function broken(file: string, detail: string): UsageError {
  const shown = answerPath(file);

  return new UsageError(
    "evidence-broken",
    `${shown} is not a readable evidence ledger: ${detail}. ` +
      "No stamp is read or written until the file is sound again.",
    `open ${shown}, resolve the conflict by hand, then run this command again`,
  );
}

/**
 * Writes the ledger whole. The text goes into a temporary file next to the
 * target and is renamed over it: an interrupted write leaves the old ledger
 * in place rather than a stump.
 */
export function writeLedger(root: string, change: string, ledger: EvidenceLedger): void {
  const file = evidenceFile(root, change);
  mkdirSync(path.dirname(file), { recursive: true });

  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(stableLedger(ledger), null, 2)}\n`, "utf8");
  renameSync(temporary, file);
}

/**
 * The ledger with its labels in alphabetical order and every record written
 * field by field in one order. The file goes into a commit, so the same ledger
 * has to give the same bytes: a merge then touches only the label that moved.
 *
 * Naming every field also decides what cannot reach the file. The environment
 * of the run holds tokens and the paths of somebody's machine, and a field
 * that is not listed here is not written, whatever the caller passed.
 */
function stableLedger(ledger: EvidenceLedger): EvidenceLedger {
  const records: Record<string, EvidenceRecord> = {};

  for (const label of Object.keys(ledger.records).sort()) {
    const record = ledger.records[label]!;
    records[label] = {
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
 * Replaces the record of one label and writes the ledger back. Records of
 * other labels are carried over as they were read.
 */
export function putRecord(
  root: string,
  change: string,
  label: string,
  record: EvidenceRecord,
): EvidenceLedger {
  const ledger = readLedger(root, change);
  const next: EvidenceLedger = {
    outputVersion: 1,
    records: { ...ledger.records, [label]: record },
  };

  writeLedger(root, change, next);
  return next;
}
