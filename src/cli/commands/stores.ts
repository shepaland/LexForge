import type { Command } from "commander";

import { addStore } from "../../core/data/add-store.js";
import { findWorkspaceRoot } from "../../core/workspace/find-root.js";
import { renderResult } from "../render.js";
import type { CliContext } from "../run.js";
import { refuseWithoutSubcommand } from "../subcommand-group.js";

export const STORES_DESCRIPTION = "Name the data stores of the project";
export const STORES_ADD_DESCRIPTION = "Append a data store to data_stores in the config";

export function registerStores(program: Command, context: CliContext): void {
  const group = program.command("stores").description(STORES_DESCRIPTION);
  refuseWithoutSubcommand(group);

  group
    .command("add")
    .description(STORES_ADD_DESCRIPTION)
    .argument("<store>", "name of the store, in kebab-case")
    .requiredOption("--dialect <dialect>", "SQL dialect or database kind, such as postgresql or mongodb")
    .option("--json", "print one JSON document instead of human output")
    .action((store: string, options: { dialect: string; json?: boolean }) => {
      const result = addStore(findWorkspaceRoot(context.cwd), store, options.dialect);

      renderResult(result, {
        json: Boolean(options.json),
        stdout: context.stdout,
        stderr: context.stderr,
      });
      context.finish(result);
    });
}
