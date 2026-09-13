import type { Command } from "commander";

import { PLAN_ARTIFACT } from "../../core/gates/plan-check.js";
import { recordEvidence } from "../../core/gates/evidence-record.js";
import { readPlanSource } from "../../core/gates/plan-source.js";
import { recordRedRun } from "../../core/gates/red-run-record.js";
import { labelMissing } from "../../core/gates/verification-labels.js";
import { readChangeState } from "../../core/status/change-status.js";
import { findWorkspaceRoot } from "../../core/workspace/find-root.js";
import { readProjectConfig } from "../../core/workspace/project-config.js";
import { UsageError } from "../errors.js";
import { renderResult } from "../render.js";
import type { CliContext } from "../run.js";
import { refuseWithoutSubcommand } from "../subcommand-group.js";

export const EVIDENCE_DESCRIPTION = "Work with the evidence ledger of a change";
export const EVIDENCE_RECORD_DESCRIPTION =
  "Run the command of one check label and write the stamp";
export const EVIDENCE_RED_DESCRIPTION =
  "Run the failing command of one task and record it as its red run";

export function registerEvidence(program: Command, context: CliContext): void {
  const group = program.command("evidence").description(EVIDENCE_DESCRIPTION);
  refuseWithoutSubcommand(group);

  group
    .command("record")
    .description(EVIDENCE_RECORD_DESCRIPTION)
    // Only the change and the label are taken. A command passed in by the
    // caller would earn a green stamp for `true`, and the ledger would stop
    // vouching for anything.
    .allowExcessArguments(false)
    .requiredOption("--change <name>", "change the stamp belongs to")
    .option("--label <label>", "check label described in the verification section")
    .option("--json", "print one JSON document instead of human output")
    .action(async (options: { change: string; label?: string; json?: boolean }) => {
      const label = options.label ?? missingLabel(context.cwd);

      const result = await recordEvidence({
        cwd: context.cwd,
        change: options.change,
        label,
        // The output of the run goes where the human lines go, so standard
        // output carries the JSON document alone.
        stdout: options.json ? context.stderr : context.stdout,
        stderr: context.stderr,
      });

      renderResult(result, {
        json: Boolean(options.json),
        stdout: context.stdout,
        stderr: context.stderr,
      });
      context.finish(result);
    });

  group
    .command("red")
    .description(EVIDENCE_RED_DESCRIPTION)
    // Only the change, the task and the command are taken. A flag that took a
    // failing line, an exit code or an output tail would let an agent write a
    // record for a run that never happened, which is exactly what this
    // command exists to make impossible.
    .allowExcessArguments(false)
    .requiredOption("--change <name>", "change the record belongs to")
    .requiredOption("--task <id>", "task id, as tasks.md writes it")
    .requiredOption("--command <command>", "command to run; its own run is what gets recorded")
    .option("--json", "print one JSON document instead of human output")
    .action(
      async (options: { change: string; task: string; command: string; json?: boolean }) => {
        assertTaskKnown(context.cwd, options.change, options.task);

        const result = await recordRedRun({
          cwd: context.cwd,
          change: options.change,
          task: options.task,
          command: options.command,
          // The output of the run goes where the human lines go, so standard
          // output carries the JSON document alone.
          stdout: options.json ? context.stderr : context.stdout,
          stderr: context.stderr,
        });

        renderResult(result, {
          json: Boolean(options.json),
          stdout: context.stdout,
          stderr: context.stderr,
        });
        context.finish(result);
      },
    );
}

/**
 * A call without a label is refused by naming the labels this project has.
 * The parser would only say the flag is required, and the reader would be left
 * guessing what to write after it.
 */
function missingLabel(cwd: string): never {
  throw labelMissing(readProjectConfig(findWorkspaceRoot(cwd)));
}

/**
 * A task id `tasks.md` does not carry is refused by naming the ids it does
 * carry: guessing a mistyped id right does not run this command twice, so the
 * reader is told the whole list here.
 */
function assertTaskKnown(cwd: string, change: string, task: string): void {
  const root = findWorkspaceRoot(cwd);
  const ids = knownTaskIds(root, change);

  if (ids.includes(task)) {
    return;
  }

  throw new UsageError(
    "task-unknown",
    `change "${change}" has no task "${task}" in its plan. ` +
      (ids.length > 0
        ? `Its plan holds: ${ids.join(", ")}.`
        : "Its plan holds no task ids yet."),
    ids.length > 0
      ? `use one of the task ids the plan holds, then run this command again`
      : `write tasks.md, then run this command again`,
  );
}

/** Task ids the plan of a change carries, in the order `tasks.md` writes them. */
function knownTaskIds(root: string, change: string): string[] {
  const { state } = readChangeState(root, change);
  const artifact = state.artifacts.find((item) => item.id === PLAN_ARTIFACT);

  if (!artifact || artifact.status !== "done") {
    return [];
  }

  return readPlanSource(artifact.resolvedOutputPath)
    .tasks.map((task) => task.number)
    .filter((number) => number !== "");
}
