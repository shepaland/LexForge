import type { Command } from "commander";

import { ENTRY_KINDS, addEntry, openSession, resolveEntry, type EntryKind } from "../../core/tasks/journal.js";
import type { CommandResult } from "../../core/types.js";
import { findWorkspaceRoot } from "../../core/workspace/find-root.js";
import { UsageError } from "../errors.js";
import { renderResult } from "../render.js";
import type { CliContext } from "../run.js";
import { refuseWithoutSubcommand } from "../subcommand-group.js";

export const JOURNAL_DESCRIPTION = "Keep the change journal: decisions, questions, promises, permissions, rulings";

interface Common {
  change: string;
  json?: boolean;
}

function respond(context: CliContext, json: boolean | undefined, data: { nextStep: string; summary: string } & Record<string, unknown>): void {
  const result: CommandResult<unknown> = {
    data: { outputVersion: 1, ...data },
    lines: [data.summary],
    nextStep: data.nextStep,
    exitCode: 0,
  };
  renderResult(result, { json: Boolean(json), stdout: context.stdout, stderr: context.stderr });
  context.finish(result);
}

function subcommand(group: Command, name: string, description: string): Command {
  return group
    .command(name)
    .description(description)
    .allowExcessArguments(false)
    .requiredOption("--change <name>", "change the journal belongs to")
    .option("--json", "print one JSON document instead of human output");
}

export function registerJournal(program: Command, context: CliContext): void {
  const group = program.command("journal").description(JOURNAL_DESCRIPTION);
  refuseWithoutSubcommand(group);

  subcommand(group, "add", "Write an entry into the journal")
    .requiredOption("--kind <kind>", `one of ${ENTRY_KINDS.join(", ")}`)
    .requiredOption("--text <text>", "what the entry says")
    .option("--quote <words>", "the owner's own words; required for a decision and a permission")
    .option("--reason <why>", "why the agent decided so; required for a ruling")
    .option("--scope <scope>", "task:<id>, change or session; change when omitted")
    .action((options: Common & { kind: string; text: string; quote?: string; reason?: string; scope?: string }) => {
      if (!(ENTRY_KINDS as readonly string[]).includes(options.kind)) {
        throw new UsageError(
          "unknown-kind",
          `"${options.kind}" is not an entry kind; use ${ENTRY_KINDS.join(", ")}.`,
          `lexforge journal add --change ${options.change} --kind question --text "<text>"`,
        );
      }
      const root = findWorkspaceRoot(context.cwd);
      const entry = addEntry(root, options.change, { ...options, kind: options.kind as EntryKind });
      respond(context, options.json, {
        entry,
        nextStep: `lexforge resume --change ${options.change}`,
        summary: `Wrote ${entry.id}: ${entry.kind}, ${entry.text}`,
      });
    });

  subcommand(group, "resolve", "Close an entry with a note")
    .requiredOption("--id <id>", "entry number such as J1")
    .requiredOption("--note <words>", "how the entry was settled")
    .action((options: Common & { id: string; note: string }) => {
      const root = findWorkspaceRoot(context.cwd);
      const entry = resolveEntry(root, options.change, options.id, options.note);
      respond(context, options.json, {
        entry,
        nextStep: `lexforge resume --change ${options.change}`,
        summary: `Resolved ${entry.id}: ${options.note}`,
      });
    });

  subcommand(group, "session", "Open a new session; permissions of the last session expire").action((options: Common) => {
    const root = findWorkspaceRoot(context.cwd);
    const result = openSession(root, options.change);
    respond(context, options.json, {
      ...result,
      nextStep: `lexforge resume --change ${options.change}`,
      summary:
        `Opened session ${result.session}.` +
        (result.expired.length > 0 ? ` Expired permissions: ${result.expired.join(", ")}.` : ""),
    });
  });
}
