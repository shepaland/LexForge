import { existsSync } from "node:fs";
import { z } from "zod";
import { UsageError } from "../../cli/errors.js";
import { readJson, save } from "./files.js";
import { withChangeLock } from "./lock.js";
import { journalPath } from "./paths.js";
import { findPlanTask } from "./plan-ready.js";
import type { TaskRecord } from "./records.js";

const CODE = "journal-unreadable";

export const ENTRY_KINDS = ["decision", "question", "promise", "permission", "ruling"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

const ScopeSchema = z.union([
  z.object({ kind: z.literal("task"), task: z.string() }).strict(),
  z.object({ kind: z.literal("change") }).strict(),
  z.object({ kind: z.literal("session"), session: z.number().int() }).strict(),
]);

const EntrySchema = z
  .object({
    id: z.string().regex(/^J\d+$/),
    kind: z.enum(ENTRY_KINDS),
    text: z.string(),
    quote: z.string().nullable(),
    reason: z.string().nullable(),
    scope: ScopeSchema,
    session: z.number().int(),
    at: z.string(),
    resolved: z.object({ at: z.string(), note: z.string() }).strict().nullable(),
  })
  .strict();

const JournalSchema = z
  .object({ version: z.literal(1), session: z.number().int(), entries: z.array(EntrySchema) })
  .strict();

export type Scope = z.infer<typeof ScopeSchema>;
export type JournalEntry = z.infer<typeof EntrySchema>;
export type Journal = z.infer<typeof JournalSchema>;

export function readJournal(root: string, change: string): Journal {
  const file = journalPath(root, change);
  return existsSync(file) ? readJson(file, JournalSchema, CODE) : { version: 1, session: 0, entries: [] };
}

function writeJournal(root: string, change: string, journal: Journal): void {
  save(journalPath(root, change), JournalSchema.parse(journal));
}

function addCommand(change: string, kind: string): string {
  const extra = kind === "ruling" ? ' --reason "<why>"' : ' --quote "<owner\'s words>"';
  return `lexforge journal add --change ${change} --kind ${kind} --text "<text>"${extra}`;
}

function parseScope(root: string, change: string, journal: Journal, raw: string | undefined): Scope {
  if (raw === undefined || raw === "change") return { kind: "change" };
  if (raw === "session") {
    if (journal.session === 0) {
      throw new UsageError(
        "session-not-open",
        `change "${change}" has no open session, so an entry cannot be tied to one.`,
        `lexforge journal session --change ${change}`,
      );
    }
    return { kind: "session", session: journal.session };
  }
  const task = /^task:(\S+)$/.exec(raw)?.[1];
  if (task === undefined) {
    throw new UsageError(
      "scope-invalid",
      `"${raw}" is not a scope; use task:<id>, change or session.`,
      `lexforge journal add --change ${change} --kind <kind> --text "<text>" --scope change`,
    );
  }
  findPlanTask(root, change, task);
  return { kind: "task", task };
}

export function addEntry(
  root: string,
  change: string,
  input: { kind: EntryKind; text: string; quote?: string; reason?: string; scope?: string },
): JournalEntry {
  const text = input.text.trim();
  if (text === "") {
    throw new UsageError("text-required", "a journal entry needs its text.", addCommand(change, input.kind));
  }
  const quote = (input.quote ?? "").trim();
  const reason = (input.reason ?? "").trim();
  if ((input.kind === "decision" || input.kind === "permission") && quote === "") {
    throw new UsageError(
      "quote-required",
      `a ${input.kind} records the owner's own words, and the quote is empty.`,
      addCommand(change, input.kind),
    );
  }
  if (input.kind === "ruling" && reason === "") {
    throw new UsageError("reason-required", "a ruling records why the agent decided so, and the reason is empty.", addCommand(change, input.kind));
  }
  return withChangeLock(root, change, "journal add", () => {
    const journal = readJournal(root, change);
    const entry: JournalEntry = {
      id: `J${journal.entries.length + 1}`,
      kind: input.kind,
      text,
      quote: quote === "" ? null : quote,
      reason: reason === "" ? null : reason,
      scope: parseScope(root, change, journal, input.scope),
      session: journal.session,
      at: new Date().toISOString(),
      resolved: null,
    };
    journal.entries.push(entry);
    writeJournal(root, change, journal);
    return entry;
  });
}

export function resolveEntry(root: string, change: string, id: string, note: string): JournalEntry {
  const words = note.trim();
  if (words === "") {
    throw new UsageError(
      "note-required",
      "resolving an entry records how it was settled, and the note is empty.",
      `lexforge journal resolve --change ${change} --id ${id} --note "<answer>"`,
    );
  }
  return withChangeLock(root, change, "journal resolve", () => {
    const journal = readJournal(root, change);
    const entry = journal.entries.find((e) => e.id === id);
    if (entry === undefined) {
      throw new UsageError(
        "entry-not-found",
        `the journal of change "${change}" holds no entry ${id}.`,
        `lexforge resume --change ${change}`,
      );
    }
    if (entry.resolved !== null) {
      throw new UsageError(
        "entry-already-resolved",
        `entry ${id} was resolved at ${entry.resolved.at}: ${entry.resolved.note}`,
        `lexforge resume --change ${change}`,
      );
    }
    entry.resolved = { at: new Date().toISOString(), note: words };
    writeJournal(root, change, journal);
    return entry;
  });
}

/** Starts the next session. Permissions tied to the session that just ended are left behind. */
export function openSession(root: string, change: string): { session: number; expired: string[] } {
  return withChangeLock(root, change, "journal session", () => {
    const journal = readJournal(root, change);
    const expired = journal.entries
      .filter((e) => e.kind === "permission" && e.resolved === null && e.scope.kind === "session" && e.scope.session === journal.session)
      .map((e) => e.id);
    journal.session += 1;
    writeJournal(root, change, journal);
    return { session: journal.session, expired };
  });
}

/** Entries still in force: unresolved, and for a permission, inside its scope. */
export function activeEntries(journal: Journal, records: TaskRecord[]): JournalEntry[] {
  return journal.entries.filter((entry) => {
    if (entry.resolved !== null) return false;
    if (entry.kind !== "permission") return true;
    if (entry.scope.kind === "session") return entry.scope.session === journal.session;
    if (entry.scope.kind === "task") {
      const task = entry.scope.task;
      return records.find((r) => r.id === task)?.closed == null;
    }
    return true;
  });
}
