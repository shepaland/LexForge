import type { Command } from "commander";

import { createChange } from "../../core/change/create-change.js";
import { renderResult } from "../render.js";
import type { CliContext } from "../run.js";

export const NEW_DESCRIPTION = "Start a new change from a schema";

export function registerNew(program: Command, context: CliContext): void {
  const command = program.command("new").description(NEW_DESCRIPTION);

  command
    .command("change <name>")
    .description("Create lexforge/changes/<name>/ with its .lexforge.yaml")
    .option("--schema <name>", "schema of this change; without it the project default is used")
    .option("--json", "print one JSON document instead of human output")
    .action((name: string, options: { schema?: string; json?: boolean }) => {
      const result = createChange({ cwd: context.cwd, name, schema: options.schema });

      renderResult(result, {
        json: Boolean(options.json),
        stdout: context.stdout,
        stderr: context.stderr,
      });
      context.finish(result);
    });
}
