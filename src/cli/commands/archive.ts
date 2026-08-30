import type { Command } from "commander";

import { archiveChange } from "../../core/archive/archive-change.js";
import { renderResult } from "../render.js";
import type { CliContext } from "../run.js";

export const ARCHIVE_DESCRIPTION =
  "Merge the delta of a change into the specs and move the change into the archive";

export function registerArchive(program: Command, context: CliContext): void {
  program
    .command("archive")
    .description(ARCHIVE_DESCRIPTION)
    .argument("<change>", "name of the change to archive")
    // Nothing is taken beyond the change and the output flag. A flag that skips
    // a check is the flag that gets passed on the day the check first fails.
    .allowExcessArguments(false)
    .option("--json", "print one JSON document instead of human output")
    .action((change: string, options: { json?: boolean }) => {
      const result = archiveChange({ cwd: context.cwd, change });

      renderResult(result, {
        json: Boolean(options.json),
        stdout: context.stdout,
        stderr: context.stderr,
      });
      context.finish(result);
    });
}
