import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const run = promisify(execFile);

/** The local `vitest` entry point, called directly: this is not the lexforge CLI, so it carries no registry-stub duty. */
const VITEST_BIN = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../node_modules/vitest/vitest.mjs",
);

/**
 * Each of these seven builds a git workspace for every one of its cases
 * through `execFileSync`, which blocks the worker's event loop for the whole
 * call. Run together, the cumulative block across a file's cases used to
 * outlast the 60-second reply window vitest's own runner gives a queued
 * `onTaskUpdate`, so the group finished every test green and still exited `1`
 * on `Error: [vitest-worker]: Timeout calling "onTaskUpdate"`. This test runs
 * exactly that group through a real `vitest run` and pins both the exit code
 * and the absence of that error, so a fix that drops its yield back to the
 * event loop fails here before it reaches the full suite.
 */
const HEAVY_GATE_FILES = [
  "tests/core/gates/verify-change-evidence.test.ts",
  "tests/core/gates/verify-change-records.test.ts",
  "tests/core/gates/verify-change-tasks.test.ts",
  "tests/core/gates/verify-change-trace.test.ts",
  "tests/core/gates/verify-change.test.ts",
  "tests/core/gates/verify-refusals.test.ts",
  "tests/core/gates/verify-short-path.test.ts",
];

describe("the suite under its own parallelism", () => {
  it(
    "runs the seven heaviest gate files together without a birpc timeout",
    async () => {
      const result = await run(process.execPath, [VITEST_BIN, "run", "--reporter=dot", ...HEAVY_GATE_FILES], {
        cwd: process.cwd(),
        maxBuffer: 32 * 1024 * 1024,
      }).then(
        (ok) => ({ status: 0, output: ok.stdout + ok.stderr }),
        (error) => ({
          status: typeof error.code === "number" ? error.code : 1,
          output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
        }),
      );

      expect(result.status).toBe(0);
      expect(result.output).not.toContain("Timeout calling");
    },
    180_000,
  );
});
