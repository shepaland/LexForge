import { UsageError } from "../../cli/errors.js";
import { answerPath } from "../answer-path.js";
import type { CommandResult } from "../types.js";
import { findWorkspaceRoot } from "../workspace/find-root.js";
import { mutateLedger, type DefectEntry } from "./store.js";

export interface CloseDefectOptions {
  /** Any directory inside the project; the workspace root is looked up from it. */
  cwd: string;
  id: string;
}

export interface CloseDefectData {
  outputVersion: 1;
  workspaceRoot: string;
  /** The entry as it stands after closing. */
  defect: DefectEntry;
  nextStep: string;
}

/**
 * Sets one entry's state to `closed` and records when. Every other field
 * stays exactly as it was recorded with — there is no command that removes
 * an entry or edits its text, only this one that marks it done.
 */
export async function closeDefect(
  options: CloseDefectOptions,
): Promise<CommandResult<CloseDefectData>> {
  const root = findWorkspaceRoot(options.cwd);
  let closed!: DefectEntry;

  // The lookup, the state check and the write all happen inside
  // `mutateLedger`'s single lock: a second `close` racing on the same
  // identifier reads the ledger this one just wrote, not the one it started
  // with, so it sees the entry already closed rather than closing it twice.
  //
  // The clock is read in here too, not before the call: `withLedgerLock`
  // waits up to its bounded timeout for a lock someone else holds, and a
  // timestamp taken before that wait would say the entry closed before the
  // write that actually closed it.
  await mutateLedger(root, (ledger) => {
    const index = ledger.defects.findIndex((entry) => entry.id === options.id);
    if (index === -1) {
      throw notFound(root, options.id);
    }

    const found = ledger.defects[index]!;
    if (found.state === "closed") {
      throw alreadyClosed(root, found);
    }

    closed = { ...found, state: "closed", closedAt: new Date().toISOString() };
    const defects = ledger.defects.slice();
    defects[index] = closed;
    return { outputVersion: 1, defects };
  });

  const nextStep = `lexforge defect list --change ${closed.change} --open`;

  const data: CloseDefectData = {
    outputVersion: 1,
    workspaceRoot: answerPath(root),
    defect: closed,
    nextStep,
  };

  return {
    data,
    lines: [`Defect ${closed.id} closed.`],
    nextStep,
    exitCode: 0,
  };
}

function notFound(root: string, id: string): UsageError {
  return new UsageError(
    "defect-close-not-found",
    `there is no defect "${id}" in ${answerPath(root)}'s ledger.`,
    "lexforge defect list to see the identifiers on record",
  );
}

function alreadyClosed(root: string, entry: DefectEntry): UsageError {
  // `closedAt` is optional in the schema: a hand edit or a merge can leave a
  // `closed` entry without one, and "closed at undefined" would be a worse
  // answer than simply not naming a time nobody recorded.
  const when = entry.closedAt ? ` (closed at ${entry.closedAt})` : "";

  return new UsageError(
    "defect-close-already-closed",
    `defect "${entry.id}" in ${answerPath(root)}'s ledger is already closed${when}. ` +
      "There is no command that reopens or removes an entry.",
    "lexforge defect list to see the identifiers on record",
  );
}
