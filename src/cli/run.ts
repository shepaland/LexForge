import os from "node:os";

import { Command, CommanderError } from "commander";

import { packageVersion } from "../core/package-info.js";
import type { CommandResult, OutputStream } from "../core/types.js";
import { registerArchive } from "./commands/archive.js";
import { registerCheck } from "./commands/check.js";
import { registerDoctor } from "./commands/doctor.js";
import { registerEvidence } from "./commands/evidence.js";
import { registerInit } from "./commands/init.js";
import { registerInstructions } from "./commands/instructions.js";
import { registerNew } from "./commands/new-change.js";
import { registerStatus } from "./commands/status.js";
import { registerValidate } from "./commands/validate.js";
import { registerVerify } from "./commands/verify.js";
import { UsageError } from "./errors.js";
import { renderUsageError } from "./render.js";

export interface RunOptions {
  cwd: string;
  /** The home directory a user-scope installation writes under. */
  home?: string;
  /** The `PATH` value `doctor` resolves the command name against. */
  pathValue?: string;
  /** The file this run was started from, for `doctor`'s `PATH` check. */
  runningFile?: string;
  stdout?: OutputStream;
  stderr?: OutputStream;
}

/**
 * What a command needs from the shell around it. Commands report their result
 * through `finish`; the exit code is decided in one place, in `runProgram`.
 */
export interface CliContext {
  cwd: string;
  home: string;
  pathValue: string;
  runningFile: string;
  stdout: OutputStream;
  stderr: OutputStream;
  finish(result: CommandResult<unknown>): void;
  readonly exitCode: number;
}

export function createCliContext(options: RunOptions): CliContext {
  let exitCode = 0;

  return {
    cwd: options.cwd,
    home: options.home ?? os.homedir(),
    pathValue: options.pathValue ?? process.env.PATH ?? "",
    runningFile: options.runningFile ?? process.argv[1] ?? "",
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

export function createProgram(context: CliContext): Command {
  const program = new Command();

  program
    .name("lexforge")
    .description("Spec-driven pipeline with gates that agents cannot skip")
    .version(packageVersion())
    .exitOverride()
    // A refused call prints the help of the command that refused it, so the
    // reader sees the flags that command does take. Without this an unknown
    // flag reports only itself, and the next guess is as blind as the first.
    .showHelpAfterError()
    .configureOutput({
      writeOut: (text) => {
        context.stdout.write(text);
      },
      writeErr: (text) => {
        context.stderr.write(text);
      },
    });

  registerInit(program, context);
  registerDoctor(program, context);
  registerNew(program, context);
  registerStatus(program, context);
  registerInstructions(program, context);
  registerValidate(program, context);
  registerCheck(program, context);
  registerEvidence(program, context);
  registerVerify(program, context);
  registerArchive(program, context);

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
      // The help is already on the error stream: commander printed the one of
      // the command that refused the call.
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
