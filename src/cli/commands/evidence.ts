import type { Command } from "commander";

import { recordEvidence } from "../../core/gates/evidence-record.js";
import { labelMissing } from "../../core/gates/verification-labels.js";
import { findWorkspaceRoot } from "../../core/workspace/find-root.js";
import { readProjectConfig } from "../../core/workspace/project-config.js";
import { renderResult } from "../render.js";
import type { CliContext } from "../run.js";
import { refuseWithoutSubcommand } from "../subcommand-group.js";

export const EVIDENCE_DESCRIPTION = "Work with the evidence ledger of a change";
export const EVIDENCE_RECORD_DESCRIPTION =
  "Run the command of one check label and write the stamp";

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
}

/**
 * A call without a label is refused by naming the labels this project has.
 * The parser would only say the flag is required, and the reader would be left
 * guessing what to write after it.
 */
function missingLabel(cwd: string): never {
  throw labelMissing(readProjectConfig(findWorkspaceRoot(cwd)));
}
