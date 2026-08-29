import { describe, expect, it } from "vitest";

import { UsageError } from "../../src/cli/errors.js";
import { createCliContext, createProgram, run, runProgram } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";

const COMMANDS = ["init", "new", "status", "instructions", "validate"];

describe("коды возврата единой точки входа", () => {
  it("неизвестная команда даёт 2 и печатает список команд", async () => {
    const capture = createCapture();

    const exitCode = await run(["nosuchcmd"], {
      cwd: process.cwd(),
      stdout: capture.stdout,
      stderr: capture.stderr,
    });

    expect(exitCode).toBe(2);
    for (const name of COMMANDS) {
      expect(capture.err).toMatch(new RegExp(`^\\s*${name}\\b.*\\S`, "m"));
    }
  });

  it("запрошенная справка даёт 0", async () => {
    const capture = createCapture();

    const exitCode = await run(["--help"], {
      cwd: process.cwd(),
      stdout: capture.stdout,
      stderr: capture.stderr,
    });

    expect(exitCode).toBe(0);
    expect(capture.out).toContain("lexforge");
  });
});

describe("единый перехват результата команды", () => {
  it("результат с exitCode 1 даёт из run() код 1", async () => {
    const capture = createCapture();
    const context = createCliContext({
      cwd: process.cwd(),
      stdout: capture.stdout,
      stderr: capture.stderr,
    });
    const program = createProgram(context);
    program
      .command("finding")
      .description("test command that reports a finding")
      .action(() => {
        context.finish({ data: {}, lines: [], nextStep: "", exitCode: 1 });
      });

    const exitCode = await runProgram(program, ["finding"], context);

    expect(exitCode).toBe(1);
  });

  it("UsageError даёт 2, текст уходит в stderr, stdout остаётся пустым", async () => {
    const capture = createCapture();
    const context = createCliContext({
      cwd: process.cwd(),
      stdout: capture.stdout,
      stderr: capture.stderr,
    });
    const program = createProgram(context);
    program
      .command("boom")
      .description("test command that cannot be carried out")
      .action(() => {
        throw new UsageError("workspace-not-found", "no lexforge workspace here", "lexforge init");
      });

    const exitCode = await runProgram(program, ["boom"], context);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("no lexforge workspace here");
    expect(capture.out).toBe("");
  });

  it("любое другое исключение даёт 2 с текстом internal error и именем исключения", async () => {
    const capture = createCapture();
    const context = createCliContext({
      cwd: process.cwd(),
      stdout: capture.stdout,
      stderr: capture.stderr,
    });
    const program = createProgram(context);
    program
      .command("crash")
      .description("test command that fails unexpectedly")
      .action(() => {
        throw new TypeError("undefined is not a function");
      });

    const exitCode = await runProgram(program, ["crash"], context);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("internal error");
    expect(capture.err).toContain("TypeError");
    expect(capture.out).toBe("");
  });
});
