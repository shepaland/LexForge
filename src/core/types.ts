/** Anything a command can write to: a real process stream or a test capture. */
export interface OutputStream {
  write(chunk: string): unknown;
}

/** Exit codes a command may finish with. `2` is reserved for `UsageError`. */
export type ResultExitCode = 0 | 1;

/**
 * What every command returns. `data` goes to stdout under `--json`, `lines`
 * are printed for a human, `nextStep` is the command to run next.
 */
export interface CommandResult<TData = Record<string, unknown>> {
  data: TData;
  lines: string[];
  nextStep: string;
  exitCode: ResultExitCode;
}
