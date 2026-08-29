import { describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";

const COMMANDS = ["init", "new", "status", "instructions", "validate"];

describe("run без аргументов", () => {
  it("печатает пять команд с однострочными описаниями и даёт код 0", async () => {
    const capture = createCapture();

    const exitCode = await run([], {
      cwd: process.cwd(),
      stdout: capture.stdout,
      stderr: capture.stderr,
    });

    expect(exitCode).toBe(0);
    for (const name of COMMANDS) {
      expect(capture.out).toMatch(new RegExp(`^\\s*${name}\\b.*\\S`, "m"));
    }
  });
});
