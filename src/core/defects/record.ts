import { randomBytes } from "node:crypto";

import { UsageError } from "../../cli/errors.js";
import { answerPath } from "../answer-path.js";
import { isKebabCase } from "../change/kebab-case.js";
import type { CommandResult } from "../types.js";
import { readChangeConfig } from "../workspace/change-config.js";
import { findWorkspaceRoot } from "../workspace/find-root.js";
import { mutateLedger, type DefectEntry, type DefectLevel } from "./store.js";

const LEVELS: readonly DefectLevel[] = ["critical", "important", "minor"];

export interface RecordDefectOptions {
  /** Any directory inside the project; the workspace root is looked up from it. */
  cwd: string;
  change: string;
  /** Raw flag values, as commander hands them over: absent when not given. */
  level?: string;
  file?: string;
  line?: string;
  summary?: string;
}

export interface RecordDefectData {
  outputVersion: 1;
  workspaceRoot: string;
  /** The entry as it was written to the ledger. */
  defect: DefectEntry;
  nextStep: string;
}

/**
 * Adds one entry to the project's defect ledger. `--change` is enforced by
 * the command's own `requiredOption`; the other four are validated here
 * together, so a call missing more than one names every flag it lacks at
 * once rather than one refusal per rerun.
 */
export async function recordDefect(
  options: RecordDefectOptions,
): Promise<CommandResult<RecordDefectData>> {
  const root = findWorkspaceRoot(options.cwd);
  // A spelling that is not the change's own name is checked before anything
  // else: `readChangeConfig` resolves a directory through `path.join`, which
  // quietly strips a trailing slash or `/.` and, on a case-insensitive
  // filesystem, ignores case too. The entry then stores the spelling
  // verbatim, and `defectFindings` matches it against `--change <name>` by
  // exact string — an open entry above MINOR that no gate can match is not a
  // finding for the change it was meant to name.
  assertChangeName(options.change);
  // The change is checked before anything else: an entry naming a change
  // that does not exist is not a fact about that change, it is a typo.
  readChangeConfig(root, options.change);

  assertPresent(options);
  const level = assertLevel(options.level!);
  const line = assertLine(options.line!);

  let written!: DefectEntry;

  // The whole change — reading the current entries, picking an identifier
  // that is not already one of them, writing the new list back — happens
  // inside `mutateLedger`'s single lock, so two calls racing on the same
  // ledger cannot both pick the same identifier or overwrite one another.
  //
  // The clock is read in here too, not before the call: `withLedgerLock`
  // waits up to its bounded timeout for a lock someone else holds, and a
  // timestamp taken before that wait would say the entry existed before it
  // was actually written.
  await mutateLedger(root, (ledger) => {
    written = {
      id: freshIdentifier(ledger.defects),
      change: options.change,
      level,
      file: options.file!,
      line,
      summary: options.summary!,
      state: "open",
      recordedAt: new Date().toISOString(),
    };

    return { outputVersion: 1, defects: [...ledger.defects, written] };
  });

  const nextStep = `once "${written.summary}" is fixed, run: lexforge defect close ${written.id}`;

  const data: RecordDefectData = {
    outputVersion: 1,
    workspaceRoot: answerPath(root),
    defect: written,
    nextStep,
  };

  return {
    data,
    lines: [
      `Defect ${written.id} recorded for ${written.change} (${written.level}) at ` +
        `${written.file}:${written.line}.`,
    ],
    nextStep,
    exitCode: 0,
  };
}

/** An eight-character hexadecimal identifier not already used in the ledger. */
function freshIdentifier(existing: DefectEntry[]): string {
  const used = new Set(existing.map((entry) => entry.id));

  let id = randomBytes(4).toString("hex");
  while (used.has(id)) {
    id = randomBytes(4).toString("hex");
  }

  return id;
}

/**
 * Only a change's own name is accepted — the same shape `lexforge new
 * change` already enforces. Anything else is refused here rather than left
 * to `readChangeConfig`, which resolves a directory and would accept a
 * spelling the ledger cannot use later.
 */
function assertChangeName(change: string): void {
  if (isKebabCase(change)) {
    return;
  }

  throw new UsageError(
    "defect-record-change-invalid",
    `"${change}" is not a change name. Use lowercase letters, digits and single dashes, ` +
      "exactly as the change's own directory is named.",
    "lexforge status to see the active changes",
  );
}

/**
 * The parser only enforces `--change`. The other four are optional at that
 * layer on purpose, so a call missing several of them is named in one
 * refusal instead of one rerun per flag.
 */
function assertPresent(options: RecordDefectOptions): void {
  const missing: string[] = [];
  if (!options.level) missing.push("--level");
  if (!options.file) missing.push("--file");
  if (options.line === undefined || options.line === "") missing.push("--line");
  if (!options.summary) missing.push("--summary");

  if (missing.length === 0) {
    return;
  }

  throw new UsageError(
    "defect-record-missing-flag",
    `this call needs ${missing.join(", ")}. A defect needs a level, a place to look ` +
      "and a summary: a summary with no file and line is not an entry a gate can act on.",
    "lexforge defect record --change <name> --level <critical|important|minor> " +
      '--file <path> --line <number> --summary "<text>"',
  );
}

function assertLevel(level: string): DefectLevel {
  if ((LEVELS as string[]).includes(level)) {
    return level as DefectLevel;
  }

  throw new UsageError(
    "defect-record-invalid-level",
    `--level must be one of critical, important, minor. Got "${level}".`,
    "lexforge defect record --change <name> --level <critical|important|minor> " +
      '--file <path> --line <number> --summary "<text>"',
  );
}

/**
 * Nothing but decimal digits. `Number.parseInt` stops at the first character
 * it cannot read, so on its own it turns "1e3" into 1 instead of rejecting
 * it — a summary pointing at the wrong line is worse than one pointing
 * nowhere, because it looks answered. Whitespace, a sign, a decimal point,
 * an exponent: all rejected here, before parsing ever runs.
 */
const DIGITS_ONLY = /^\d+$/;

function assertLine(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!DIGITS_ONLY.test(raw) || !Number.isSafeInteger(parsed) || parsed < 1) {
    throw new UsageError(
      "defect-record-invalid-line",
      `--line must be written as digits only, a whole number of at least 1. Got "${raw}".`,
      "lexforge defect record --change <name> --level <critical|important|minor> " +
        '--file <path> --line <number> --summary "<text>"',
    );
  }

  return parsed;
}
