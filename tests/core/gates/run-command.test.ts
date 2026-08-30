import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { commandNeverStarted, runLabelCommand } from "../../../src/core/gates/run-command.js";
import { createCapture } from "../../helpers/capture.js";

/** UTC, ISO 8601, to the millisecond: the form `Date.prototype.toISOString` gives. */
const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function run(command: string) {
  const capture = createCapture();
  return runLabelCommand({
    command,
    cwd: process.cwd(),
    stdout: capture.stdout,
    stderr: capture.stderr,
  }).then((result) => ({ result, capture }));
}

describe("runLabelCommand", () => {
  it("зелёная команда даёт код 0, длительность и момент начала в UTC по ISO 8601", async () => {
    const { result } = await run('node -e "process.exit(0)"');

    expect(result.exitCode).toBe(0);
    expect(result.startedAt).toMatch(UTC_ISO);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.durationMs)).toBe(true);
  });

  it("команда с кодом 3 отдаёт 3", async () => {
    const { result } = await run('node -e "process.exit(3)"');

    expect(result.exitCode).toBe(3);
  });
});

/** Prints three hundred numbered lines, each padded so the whole run is well over 8 KB. */
const THREE_HUNDRED_LINES =
  'node -e "for (let i = 1; i <= 300; i += 1) ' +
  "process.stdout.write(String(i) + ' ' + 'x'.repeat(60) + '\\n')\"";

const THREE_LINES = "node -e \"process.stdout.write('one\\ntwo\\nthree\\n')\"";

/**
 * Writes to both streams with a gap between the writes, so the order the two
 * pipes arrive in is the order they were written in.
 */
const BOTH_STREAMS =
  'node -e "process.stdout.write(\'first\\n\'); ' +
  "setTimeout(() => { process.stderr.write('second\\n'); " +
  "setTimeout(() => process.stdout.write('third\\n'), 60); }, 60)\"";

function tailLines(tail: string): string[] {
  return tail === "" ? [] : tail.replace(/\n$/, "").split("\n");
}

describe("runLabelCommand: хвост вывода", () => {
  it("триста строк дают не больше ста строк и не больше 8192 байт с признаком усечения", async () => {
    const { result } = await run(THREE_HUNDRED_LINES);

    expect(result.exitCode).toBe(0);
    expect(tailLines(result.outputTail).length).toBeLessThanOrEqual(100);
    expect(Buffer.byteLength(result.outputTail, "utf8")).toBeLessThanOrEqual(8192);
    expect(result.outputTruncated).toBe(true);
    expect(tailLines(result.outputTail).at(-1)).toContain("300 ");
  });

  it("три строки дают три строки без признака усечения", async () => {
    const { result } = await run(THREE_LINES);

    expect(tailLines(result.outputTail)).toEqual(["one", "two", "three"]);
    expect(result.outputTruncated).toBe(false);
  });

  it("строки обоих потоков идут в порядке печати", async () => {
    const { result } = await run(BOTH_STREAMS);

    expect(tailLines(result.outputTail)).toEqual(["first", "second", "third"]);
  });
});

function waitFor(condition: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const tick = (): void => {
      if (condition()) {
        resolve();
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error("the condition never came true"));
        return;
      }
      setTimeout(tick, 5);
    };
    tick();
  });
}

describe("runLabelCommand: печать вывода", () => {
  it("полный вывод уходит в переданный поток, а не только в хвост", async () => {
    const { result, capture } = await run(THREE_HUNDRED_LINES);

    const printed = tailLines(capture.out);

    expect(printed.length).toBe(300);
    expect(printed[0]!.startsWith("1 ")).toBe(true);
    expect(printed.at(-1)!.startsWith("300 ")).toBe(true);
    expect(tailLines(result.outputTail).some((line) => line.startsWith("1 "))).toBe(false);
  });

  it("вывод идёт в поток по мере поступления, а не в конце прогона", async () => {
    const capture = createCapture();
    let finished = false;
    const running = runLabelCommand({
      command: BOTH_STREAMS,
      cwd: process.cwd(),
      stdout: capture.stdout,
      stderr: capture.stderr,
    }).then((result) => {
      finished = true;
      return result;
    });

    await waitFor(() => capture.out.includes("first"));

    expect(finished).toBe(false);
    expect(capture.out).not.toContain("third");

    await running;

    expect(capture.err).toContain("second");
    expect(capture.out).toContain("third");
  });
});

describe("commandNeverStarted", () => {
  /** Каталог с командой под именем, которое считает исполняемым эта система. */
  function pathWith(name: string): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), "lexforge-path-"));
    dirs.push(dir);
    writeFileSync(path.join(dir, name), "#!/usr/bin/env node\n", { encoding: "utf8", mode: 0o755 });
    return dir;
  }

  const dirs: string[] = [];
  const EMPTY = mkdtempSync(path.join(os.tmpdir(), "lexforge-path-"));
  dirs.push(EMPTY);

  afterAll(() => {
    while (dirs.length > 0) {
      rmSync(dirs.pop()!, { recursive: true, force: true });
    }
  });

  it("коды 127 и 126 говорят, что команда не запустилась", () => {
    expect(commandNeverStarted({ exitCode: 127, command: "npm test", platform: "linux" })).toBe(
      true,
    );
    expect(commandNeverStarted({ exitCode: 126, command: "npm test", platform: "linux" })).toBe(
      true,
    );
  });

  it("красный прогон проверки за незапустившуюся команду не принимается", () => {
    expect(commandNeverStarted({ exitCode: 1, command: "npm test", platform: "linux" })).toBe(
      false,
    );
  });

  it("на Windows отвечает по PATH: голого имени там нет, значит команда не запускалась", () => {
    expect(
      commandNeverStarted({
        exitCode: 1,
        command: "lexforge-no-such-binary-here --run",
        platform: "win32",
        pathValue: EMPTY,
      }),
    ).toBe(true);
  });

  it("на Windows команда, лежащая на PATH, упавшей проверкой и остаётся", () => {
    expect(
      commandNeverStarted({
        exitCode: 1,
        command: "checker --strict",
        platform: "win32",
        pathValue: pathWith("checker.cmd"),
      }),
    ).toBe(false);
  });

  it("имя, которое cmd.exe выполняет сам, на PATH не ищется", () => {
    expect(
      commandNeverStarted({
        exitCode: 1,
        command: "echo hello",
        platform: "win32",
        pathValue: EMPTY,
      }),
    ).toBe(false);
  });

  it("нулевой код возврата ни при какой системе не значит, что команда не пошла", () => {
    expect(
      commandNeverStarted({
        exitCode: 0,
        command: "lexforge-no-such-binary-here",
        platform: "win32",
        pathValue: EMPTY,
      }),
    ).toBe(false);
  });
});
