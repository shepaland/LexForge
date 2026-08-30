import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";

const COMMANDS = ["init", "new", "status", "instructions", "validate"];

const PACKAGE_JSON = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "package.json",
);

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

describe("run с флагом версии", () => {
  it("печатает версию из package.json и даёт код 0", async () => {
    const capture = createCapture();
    const version = (JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as { version: string }).version;

    const exitCode = await run(["--version"], {
      cwd: process.cwd(),
      stdout: capture.stdout,
      stderr: capture.stderr,
    });

    expect(exitCode).toBe(0);
    expect(capture.out.trim()).toBe(version);
    expect(capture.err).toBe("");
  });

  it("не повторяет версию строкой в коде команд", () => {
    const source = readFileSync(
      path.join(path.dirname(PACKAGE_JSON), "src", "cli", "run.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/"\d+\.\d+\.\d+"/);
    expect(source).toContain("package.json");
  });
});
