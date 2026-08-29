import { Command, CommanderError } from "commander";

import type { CommandResult, OutputStream } from "../core/types.js";
import { registerInit } from "./commands/init.js";
import { registerNew } from "./commands/new-change.js";
import { registerStatus } from "./commands/status.js";
import { UsageError } from "./errors.js";
import { renderUsageError } from "./render.js";

export interface RunOptions {
  cwd: string;
  stdout?: OutputStream;
  stderr?: OutputStream;
}

/**
 * What a command needs from the shell around it. Commands report their result
 * through `finish`; the exit code is decided in one place, in `runProgram`.
 */
export interface CliContext {
  cwd: string;
  stdout: OutputStream;
  stderr: OutputStream;
  finish(result: CommandResult<unknown>): void;
  readonly exitCode: number;
}

export function createCliContext(options: RunOptions): CliContext {
  let exitCode = 0;

  return {
    cwd: options.cwd,
    stdout: options.stdout ?? process.stdout,
    stderr: options.stderr ?? process.stderr,
    finish(result: CommandResult<unknown>) {
      exitCode = result.exitCode;
    },
    get exitCode() {
      return exitCode;
    },
  };
}

/** Commands still waiting for their section of the plan. */
const COMMANDS: Array<{ name: string; description: string }> = [
  {
    name: "instructions",
    description: "Show template, context, rules and instruction for one artifact",
  },
  {
    name: "validate",
    description: "Check the artifacts and the requirements of a change",
  },
];

export function createProgram(context: CliContext): Command {
  const program = new Command();

  program
    .name("lexforge")
    .description("Spec-driven pipeline with gates that agents cannot skip")
    .exitOverride()
    .configureOutput({
      writeOut: (text) => {
        context.stdout.write(text);
      },
      writeErr: (text) => {
        context.stderr.write(text);
      },
    });

  registerInit(program, context);
  registerNew(program, context);
  registerStatus(program, context);

  for (const command of COMMANDS) {
    program.command(command.name).description(command.description);
  }

  return program;
}

/**
 * The single place where an exit code is decided: `0` and `1` come from the
 * command result, `2` from any `UsageError` or unexpected failure.
 */
export async function runProgram(
  program: Command,
  argv: string[],
  context: CliContext,
): Promise<number> {
  if (argv.length === 0) {
    context.stdout.write(program.helpInformation());
    return 0;
  }

  try {
    await program.parseAsync(argv, { from: "user" });
    return context.exitCode;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === "commander.helpDisplayed" || error.code === "commander.version") {
        return 0;
      }
      context.stderr.write(program.helpInformation());
      return 2;
    }

    if (error instanceof UsageError) {
      renderUsageError(error, {
        json: wantsJson(argv),
        stdout: context.stdout,
        stderr: context.stderr,
      });
      return 2;
    }

    const name = error instanceof Error ? error.name : typeof error;
    const message = error instanceof Error ? error.message : String(error);
    context.stderr.write(`internal error: ${name}: ${message}\n`);
    return 2;
  }
}

/**
 * Where a refused call reports itself is decided by the machine-output flag,
 * and the flag is read from the arguments: a command that throws never got as
 * far as printing anything itself.
 */
function wantsJson(argv: string[]): boolean {
  return argv.includes("--json");
}

export async function run(argv: string[], options: RunOptions): Promise<number> {
  const context = createCliContext(options);
  return runProgram(createProgram(context), argv, context);
}
