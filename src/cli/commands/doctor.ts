import type { Command } from "commander";

import { runDoctor } from "../../core/doctor/run-doctor.js";
import { renderResult } from "../render.js";
import type { CliContext } from "../run.js";

export const DOCTOR_DESCRIPTION = "Check whether the local lexforge installation is healthy";

export function registerDoctor(program: Command, context: CliContext): void {
  program
    .command("doctor")
    .description(DOCTOR_DESCRIPTION)
    // Nothing this command finds gets fixed by it: there is no flag here that
    // would make it write, delete or run anything a project describes.
    .allowExcessArguments(false)
    .option("--json", "print one JSON document instead of human output")
    .action((options: { json?: boolean }) => {
      const result = runDoctor({
        cwd: context.cwd,
        home: context.home,
        pathValue: context.pathValue,
        runningFile: context.runningFile,
      });

      renderResult(result, {
        json: Boolean(options.json),
        stdout: context.stdout,
        stderr: context.stderr,
      });
      context.finish(result);
    });
}
