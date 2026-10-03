import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updateMocks = vi.hoisted(() => ({
  checkForCliUpdate: vi.fn(async () => ({
    kind: "continue" as const,
    updateAvailable: false,
  })),
}));

vi.mock("../../src/core/update-check.js", () => updateMocks);

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";

const COMMANDS = ["init", "new", "status", "instructions", "validate"];

const PACKAGE_JSON = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "package.json",
);
const STDIN_TTY_DESCRIPTOR = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");

beforeEach(() => {
  updateMocks.checkForCliUpdate.mockReset();
  updateMocks.checkForCliUpdate.mockResolvedValue({
    kind: "continue",
    updateAvailable: false,
  });
  vi.restoreAllMocks();
});

afterEach(() => {
  if (STDIN_TTY_DESCRIPTOR) {
    Object.defineProperty(process.stdin, "isTTY", STDIN_TTY_DESCRIPTOR);
  } else {
    delete (process.stdin as NodeJS.ReadStream & { isTTY?: boolean }).isTTY;
  }
});

function setStdinTTY(value: boolean): void {
  Object.defineProperty(process.stdin, "isTTY", {
    configurable: true,
    value,
  });
}

describe("run update startup", () => {
  it("checks for an update before parsing and preserves the original arguments", async () => {
    setStdinTTY(true);
    const events: string[] = [];
    const argv = ["--version"];
    const output = Object.assign({ write: vi.fn() }, { isTTY: true });
    updateMocks.checkForCliUpdate.mockImplementation(async () => {
      events.push("update");
      return { kind: "continue", updateAvailable: true };
    });
    const parse = vi.spyOn(Command.prototype, "parseAsync").mockImplementation(async function (
      received,
    ) {
      events.push("dispatch");
      expect(received).toBe(argv);
      return this;
    });

    await run(argv, {
      cwd: process.cwd(),
      stdout: output,
      checkForUpdate: updateMocks.checkForCliUpdate,
    });

    if (events[0] !== "update") {
      process.stderr.write("expected update check before command dispatch\n");
    }
    expect(events, "expected update check before command dispatch").toEqual([
      "update",
      "dispatch",
    ]);
    expect(parse).toHaveBeenCalledOnce();
  });

  it("returns without parsing after a successful update", async () => {
    setStdinTTY(true);
    const output = Object.assign({ write: vi.fn() }, { isTTY: true });
    updateMocks.checkForCliUpdate.mockResolvedValue({
      kind: "updated",
      updateAvailable: true,
    });
    const parse = vi.spyOn(Command.prototype, "parseAsync");

    const exitCode = await run(["status"], {
      cwd: process.cwd(),
      stdout: output,
      checkForUpdate: updateMocks.checkForCliUpdate,
    });

    expect(exitCode).toBe(0);
    expect(parse).not.toHaveBeenCalled();
  });

  it("continues dispatch when the update check is unavailable", async () => {
    setStdinTTY(true);
    const output = Object.assign({ write: vi.fn() }, { isTTY: true });
    updateMocks.checkForCliUpdate.mockRejectedValue(new Error("offline"));
    const parse = vi.spyOn(Command.prototype, "parseAsync").mockResolvedValue({} as Command);

    const exitCode = await run(["status"], {
      cwd: process.cwd(),
      stdout: output,
      checkForUpdate: updateMocks.checkForCliUpdate,
    });

    expect(exitCode).toBe(0);
    expect(parse).toHaveBeenCalledWith(["status"], { from: "user" });
  });

  it("does not check for updates for JSON output even on a terminal", async () => {
    setStdinTTY(true);
    const output = Object.assign({ write: vi.fn() }, { isTTY: true });
    const parse = vi.spyOn(Command.prototype, "parseAsync").mockResolvedValue({} as Command);

    await run(["status", "--json"], {
      cwd: process.cwd(),
      stdout: output,
      checkForUpdate: updateMocks.checkForCliUpdate,
    });

    if (updateMocks.checkForCliUpdate.mock.calls.length > 0) {
      process.stderr.write("expected update check before command dispatch\n");
    }
    expect(updateMocks.checkForCliUpdate).not.toHaveBeenCalled();
    expect(parse).toHaveBeenCalledOnce();
  });

  it("does not check for updates when stdout is not a terminal", async () => {
    setStdinTTY(true);
    const output = Object.assign({ write: vi.fn() }, { isTTY: false });
    const parse = vi.spyOn(Command.prototype, "parseAsync").mockResolvedValue({} as Command);

    await run(["status"], {
      cwd: process.cwd(),
      stdout: output,
      checkForUpdate: updateMocks.checkForCliUpdate,
    });

    expect(updateMocks.checkForCliUpdate).not.toHaveBeenCalled();
    expect(parse).toHaveBeenCalledOnce();
  });
});

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
    expect(source).toContain("packageVersion");
  });
});
