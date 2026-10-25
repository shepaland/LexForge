import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const GATES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "gates");

/**
 * Each of these seven builds a git workspace for every one of its cases through
 * `execFileSync`, which holds the worker's only thread for the whole call. Run back
 * to back with no turn of the event loop between cases, the block adds up past the
 * minute vitest's runner gives a queued `onTaskUpdate` to be acknowledged, and the
 * run exits `1` on `Error: [vitest-worker]: Timeout calling "onTaskUpdate"` while
 * every test in it passes. The yield after each case is what keeps `npx vitest run`
 * at `0`, so the checks below pin it in every one of the seven: a file that drops it
 * fails here, which replaying the group does not catch, since the lighter files stay
 * under the minute on their own. The hook is read as a whole line of its own, so a
 * file that comments it out fails too. Reproducing the timeout costs over a minute of
 * synchronous work by definition and three to ten times that on Windows, so these
 * read the discipline instead of replaying it; the full run the task names as its
 * command is what measures the outcome.
 */
const YIELDING_FILES = [
  "verify-change-evidence.test.ts",
  "verify-change-records.test.ts",
  "verify-change-tasks.test.ts",
  "verify-change-trace.test.ts",
  "verify-change.test.ts",
  "verify-refusals.test.ts",
  "verify-short-path.test.ts",
];

describe("the gate files that block their worker", () => {
  it("yield a whole turn of the event loop, not a microtask", async () => {
    const fixtures = await import("./gates/verify-change-fixtures.js");

    expect(typeof fixtures.yieldEventLoop).toBe("function");

    let macrotaskRan = false;
    setImmediate(() => {
      macrotaskRan = true;
    });
    await fixtures.yieldEventLoop();

    expect(macrotaskRan).toBe(true);
  });

  for (const file of YIELDING_FILES) {
    it(`${file} hands the event loop back after each case`, () => {
      const source = readFileSync(path.join(GATES, file), "utf8");

      expect(source).toMatch(/^afterEach\(yieldEventLoop\);$/m);
    });
  }
});
