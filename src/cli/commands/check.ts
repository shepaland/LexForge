import type { Command } from "commander";

import { checkPlan } from "../../core/gates/plan-check.js";
import { UsageError } from "../errors.js";
import { renderResult } from "../render.js";
import type { CliContext } from "../run.js";

export const CHECK_DESCRIPTION = "Run a gate over a change: the plan or the evidence";
export const CHECK_PLAN_DESCRIPTION = "Check the plan of a change for unwritten work";

export function registerCheck(program: Command, context: CliContext): void {
  const group = program.command("check").description(CHECK_DESCRIPTION);

  // A group is not a command of its own: called on its own, or with a name it
  // does not carry, it says what it does carry and stops. Excess arguments are
  // taken in here on purpose, so an unknown subcommand reports the same list
  // instead of the bare "too many arguments" of the parser.
  group.allowExcessArguments().action((_options: unknown, command: Command) => {
    throw noSubcommand(group, command.args[0]);
  });

  group
    .command("plan")
    .description(CHECK_PLAN_DESCRIPTION)
    .requiredOption("--change <name>", "change whose plan is checked")
    .option("--json", "print one JSON document instead of human output")
    .action((options: { change: string; json?: boolean }) => {
      const result = checkPlan({ cwd: context.cwd, change: options.change });

      renderResult(result, {
        json: Boolean(options.json),
        stdout: context.stdout,
        stderr: context.stderr,
      });
      context.finish(result);
    });
}

/** The subcommands of the group, one line each, as the refusal text. */
function noSubcommand(group: Command, given?: string): UsageError {
  const width = Math.max(...group.commands.map((command) => command.name().length));
  const lines = group.commands.map(
    (command) => `  ${command.name().padEnd(width)}  ${command.description()}`,
  );
  const opening = given
    ? `"lexforge ${group.name()}" has no subcommand "${given}". It has:`
    : `"lexforge ${group.name()}" needs a subcommand. It has:`;

  return new UsageError(
    "subcommand-missing",
    `${opening}\n${lines.join("\n")}`,
    `lexforge ${group.name()} ${group.commands[0]?.name() ?? ""} --change <name>`.trim(),
  );
}
