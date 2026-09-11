import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { UsageError } from "../../cli/errors.js";
import { answerPath } from "../answer-path.js";
import { defectsFile } from "./paths.js";
import { withLedgerLock } from "./lock.js";

export { defectsFile };

/** How bad a defect is. `critical` and `important` stop the gates; `minor` never does. */
export type DefectLevel = "critical" | "important" | "minor";

/** Whether a defect still needs fixing. */
export type DefectState = "open" | "closed";

/** One defect as it is kept on disk. Nothing is removed from the ledger, only closed. */
export interface DefectEntry {
  /** Unique within the ledger. */
  id: string;
  /** The change it was found in. Stays readable after that change is archived. */
  change: string;
  level: DefectLevel;
  file: string;
  line: number;
  summary: string;
  state: DefectState;
  /** UTC, ISO 8601. */
  recordedAt: string;
  /** UTC, ISO 8601. Present once the entry is closed. */
  closedAt?: string;
}

/** The whole ledger of the project: every defect ever recorded, open or closed. */
export interface DefectLedger {
  outputVersion: 1;
  defects: DefectEntry[];
}

/**
 * Every field of an entry is required except `closedAt`: a mangled `state` is
 * exactly the kind of damage a merge can do silently, and the gate that reads
 * this file has to be told the file is unsound rather than read a defect as
 * gone.
 */
const DefectEntrySchema = z.object({
  id: z.string(),
  change: z.string(),
  level: z.enum(["critical", "important", "minor"]),
  file: z.string(),
  line: z.number().int(),
  summary: z.string(),
  state: z.enum(["open", "closed"]),
  recordedAt: z.string(),
  closedAt: z.string().optional(),
});

const DefectLedgerSchema = z.object({
  outputVersion: z.literal(1),
  defects: z.array(DefectEntrySchema),
});

/** An empty ledger: what a project with no defect recorded yet has. */
export function emptyDefectLedger(): DefectLedger {
  return { outputVersion: 1, defects: [] };
}

/** Reads the ledger. A project with nothing recorded yet has no file, and that is not an error. */
export function readDefectLedger(root: string): DefectLedger {
  const file = defectsFile(root);

  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (error) {
    // Only "no ledger yet" reads as empty. Any other failure — a directory
    // where the file should be, no permission, a busy handle on Windows — is
    // not the same fact as "nothing recorded" and must not be reported as one.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyDefectLedger();
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw broken(file, (error as Error).message);
  }

  const result = DefectLedgerSchema.safeParse(parsed);
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
 * would be the easy way out, and it loses somebody else's finding: the file
 * breaks on a merge conflict, and only a person can tell which entry is right.
 */
function broken(file: string, detail: string): UsageError {
  const shown = answerPath(file);

  return new UsageError(
    "defect-ledger-broken",
    `${shown} is not a readable defect ledger: ${detail}. ` +
      "No defect is read or written until the file is sound again.",
    `open ${shown}, resolve the conflict by hand, then run this command again`,
  );
}

/**
 * Writes the ledger whole. The text goes into a temporary file next to the
 * target and is renamed over it: an interrupted write leaves the old ledger
 * in place rather than a stump.
 */
export function writeDefectLedger(root: string, ledger: DefectLedger): void {
  const file = defectsFile(root);
  mkdirSync(path.dirname(file), { recursive: true });

  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(stableLedger(ledger), null, 2)}\n`, "utf8");
  renameSync(temporary, file);
}

/**
 * The ledger with every entry written field by field in one order. The file
 * goes into a commit, so the same ledger has to give the same bytes, and a
 * stray field a caller's object happens to carry must not reach it.
 */
function stableLedger(ledger: DefectLedger): DefectLedger {
  return {
    outputVersion: 1,
    defects: ledger.defects.map(stableEntry),
  };
}

function stableEntry(entry: DefectEntry): DefectEntry {
  return {
    id: entry.id,
    change: entry.change,
    level: entry.level,
    file: entry.file,
    line: entry.line,
    summary: entry.summary,
    state: entry.state,
    recordedAt: entry.recordedAt,
    closedAt: entry.closedAt,
  };
}

/**
 * The only supported way to change the ledger: takes the lock, reads the
 * current ledger, hands it to `fn`, writes what comes back, and releases the
 * lock. `record` and `close` compose their change through this and never call
 * `readDefectLedger`/`writeDefectLedger` on their own — a read taken before
 * the lock is a lost update waiting to happen.
 *
 * The callback runs while the lock is already held and must not take it
 * again: `withLedgerLock` is not re-entrant, and a nested call would wait out
 * the whole bounded wait against itself before refusing.
 */
export async function mutateLedger(
  root: string,
  fn: (ledger: DefectLedger) => DefectLedger,
): Promise<DefectLedger> {
  return withLedgerLock(root, () => {
    const next = fn(readDefectLedger(root));
    writeDefectLedger(root, next);
    return next;
  });
}
