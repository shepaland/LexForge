import type { Command } from "commander";

import { setStacks } from "../../core/rules/set-stacks.js";
import { findWorkspaceRoot } from "../../core/workspace/find-root.js";
import { UsageError } from "../errors.js";
import { renderResult } from "../render.js";
import type { CliContext } from "../run.js";
import { refuseWithoutSubcommand } from "../subcommand-group.js";

export const STACKS_DESCRIPTION = "Name the technology stacks of the project";
export const STACKS_SET_DESCRIPTION = "Write the stacks to engineering.stacks in the config";

export function registerStacks(program: Command, context: CliContext): void {
  const group = program.command("stacks").description(STACKS_DESCRIPTION);
  refuseWithoutSubcommand(group);

  group
    .command("set")
    .description(STACKS_SET_DESCRIPTION)
    .argument("[stacks...]", "stacks of the project")
    .option("--none", "write an empty list: the project uses none of the shipped stacks")
    .option("--json", "print one JSON document instead of human output")
    .action((stacks: string[], options: { none?: boolean; json?: boolean }) => {
      if (options.none && stacks.length > 0) {
        throw new UsageError(
          "stacks-conflict",
          "Give either stacks or --none, not both.",
          "lexforge stacks set <stack>... or lexforge stacks set --none",
        );
      }
      if (!options.none && stacks.length === 0) {
        throw new UsageError(
          "stacks-not-given",
          "Name at least one stack, or pass --none.",
          "lexforge stacks set <stack>... or lexforge stacks set --none",
        );
      }

      const result = setStacks(findWorkspaceRoot(context.cwd), stacks);

      renderResult(result, {
        json: Boolean(options.json),
        stdout: context.stdout,
        stderr: context.stderr,
      });
      context.finish(result);
    });
}
