import type { Command } from "commander";

import { UsageError } from "./errors.js";

/**
 * A group is not a command of its own. Called on its own, or with a name it
 * does not carry, it says what it does carry and stops. Excess arguments are
 * taken in on purpose, so an unknown subcommand reports the same list instead
 * of the bare "too many arguments" of the parser.
 */
export function refuseWithoutSubcommand(group: Command): void {
  group.allowExcessArguments().action((_options: unknown, command: Command) => {
    throw noSubcommand(group, command.args[0]);
  });
}

/** The subcommands of the group, one line each, as the refusal text. */
export function noSubcommand(group: Command, given?: string): UsageError {
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
