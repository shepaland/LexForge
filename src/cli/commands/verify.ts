import type { Command } from "commander";

import { verifyChange } from "../../core/gates/verify-change.js";
import { renderResult } from "../render.js";
import type { CliContext } from "../run.js";

export const VERIFY_DESCRIPTION = "Check a change before the work is called finished";

export function registerVerify(program: Command, context: CliContext): void {
  program
    .command("verify")
    .description(VERIFY_DESCRIPTION)
    // Nothing is taken beyond the change and the output flag. A gate with a
    // switch on it is a gate that gets switched off on the day it first fails.
    .allowExcessArguments(false)
    .requiredOption("--change <name>", "change to check")
    .option("--json", "print one JSON document instead of human output")
    .action((options: { change: string; json?: boolean }) => {
      const result = verifyChange({ cwd: context.cwd, change: options.change });

      renderResult(result, {
        json: Boolean(options.json),
        stdout: context.stdout,
        stderr: context.stderr,
      });
      context.finish(result);
    });
}
