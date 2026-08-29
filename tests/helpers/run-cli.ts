import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The installed entry point: the same file `npm install` puts on the PATH. */
export const BIN_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "bin",
  "lexforge.js",
);

export interface RunCliOptions {
  cwd: string;
}

export interface CliRun {
  stdout: string;
  stderr: string;
  /** Exit code of the process. A non-zero code is a result, not a failure. */
  code: number;
}

/**
 * Runs the built CLI as a real process. A non-zero exit code is returned, not
 * thrown: the codes `1` and `2` are exactly what these tests check.
 */
export function runCli(args: string[], options: RunCliOptions): Promise<CliRun> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [BIN_PATH, ...args],
      { cwd: options.cwd, encoding: "utf8" },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== "number") {
          reject(error);
          return;
        }

        resolve({ stdout, stderr, code: error ? (error.code as number) : 0 });
      },
    );
  });
}
