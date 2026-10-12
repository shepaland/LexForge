import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The installed entry point: the same file `npm install` puts on the PATH. */
export const BIN_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "bin",
  "lexforge.js",
);

/** The registry stub every CLI process in tests loads with `--import`. */
export const STUB_PRELOAD = pathToFileURL(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "registry-stub.mjs"),
).href;

export interface RunCliOptions {
  cwd: string;
  /** The version the stubbed registry answers with. Without it the registry request fails. */
  latest?: string;
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
  const home = mkdtempSync(path.join(os.tmpdir(), "lexforge-cli-home-"));
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home };
  delete env.LEXFORGE_TEST_LATEST;
  if (options.latest !== undefined) env.LEXFORGE_TEST_LATEST = options.latest;

  return new Promise((resolve, reject) => {
    const cleanup = () => rmSync(home, { recursive: true, force: true });
    try {
      execFile(
        process.execPath,
        [`--import=${STUB_PRELOAD}`, BIN_PATH, ...args],
        { cwd: options.cwd, encoding: "utf8", env },
        (error, stdout, stderr) => {
          cleanup();
          if (error && typeof error.code !== "number") {
            reject(error);
            return;
          }

          resolve({ stdout, stderr, code: error ? (error.code as number) : 0 });
        },
      );
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
