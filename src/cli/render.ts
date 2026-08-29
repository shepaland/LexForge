import type { CommandResult, OutputStream } from "../core/types.js";
import type { UsageError } from "./errors.js";

export interface RenderOptions {
  json: boolean;
  stdout: OutputStream;
  stderr: OutputStream;
}

/**
 * Prints one command result. Under `--json` standard output carries a single
 * JSON document and nothing else, so a skill can read it without cleaning up
 * first. Without the flag the human lines are printed, and a result that
 * reports a finding goes to the error stream.
 */
export function renderResult<TData>(
  result: CommandResult<TData>,
  options: RenderOptions,
): void {
  if (options.json) {
    // Standard output carries the JSON document alone. Everything a person
    // would read goes to the error stream, so a skill parses stdout as is.
    for (const line of result.lines) {
      options.stderr.write(`${line}\n`);
    }
    options.stdout.write(`${JSON.stringify(result.data, null, 2)}\n`);
    return;
  }

  const stream = result.exitCode === 0 ? options.stdout : options.stderr;
  for (const line of result.lines) {
    stream.write(`${line}\n`);
  }
  if (result.nextStep) {
    stream.write(`Next step: ${result.nextStep}\n`);
  }
}

/**
 * Prints a refused call. Under `--json` the error takes the same shape as any
 * other machine answer, so a skill reads one document either way; without the
 * flag the text goes to the error stream and standard output stays empty.
 */
export function renderUsageError(error: UsageError, options: RenderOptions): void {
  if (options.json) {
    const document = {
      outputVersion: 1,
      error: { code: error.code, message: error.message },
      nextStep: error.nextStep,
    };
    options.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
    return;
  }

  options.stderr.write(`${error.message}\n`);
  if (error.nextStep) {
    options.stderr.write(`Next step: ${error.nextStep}\n`);
  }
}
