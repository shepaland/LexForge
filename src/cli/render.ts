import type { CommandResult, OutputStream } from "../core/types.js";

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
