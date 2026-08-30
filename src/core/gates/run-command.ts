import { spawn } from "node:child_process";
import { constants } from "node:os";

import type { OutputStream } from "../types.js";

/**
 * What a shell returns when the command is not there, and when the file is
 * there but cannot be run. Both mean the check never started, and the caller
 * tells them apart from a red run by these two numbers.
 */
export const COMMAND_NOT_FOUND = 127;
export const NOT_EXECUTABLE = 126;

/** A run killed by a signal is reported the way a shell reports it. */
const SIGNAL_BASE = 128;

/**
 * How much of the output the stamp keeps. The ledger goes into a commit, and
 * the output of a failing test run on a large project is megabytes; a hundred
 * lines hold what the output is read for — the name of the failing test and
 * the message under it.
 */
export const TAIL_BYTES = 8192;
export const TAIL_LINES = 100;

export interface RunCommandOptions {
  /** The command line, taken from the `verification` section as one string. */
  command: string;
  /** Working directory of the run: the root of the workspace. */
  cwd: string;
  /** Where the output of the run is echoed while it runs. */
  stdout: OutputStream;
  stderr: OutputStream;
}

export interface CommandRun {
  exitCode: number;
  /** Start of the run, UTC, ISO 8601. */
  startedAt: string;
  durationMs: number;
  /** End of the output, both streams merged in the order they arrived. */
  outputTail: string;
  outputTruncated: boolean;
}

/** Puts the lines back together, keeping the closing newline if there was one. */
function join(lines: string[], closed: boolean): string {
  if (lines.length === 0) {
    return "";
  }

  return lines.join("\n") + (closed ? "\n" : "");
}

/**
 * Keeps the end of the output within both limits. The two streams are merged
 * rather than kept apart: split, they lose the order the messages came in, and
 * the record becomes harder to read than the terminal was.
 */
class Tail {
  private text = "";
  private cut = false;

  add(chunk: string): void {
    this.text += chunk;
    this.trim();
  }

  get value(): string {
    return this.text;
  }

  get truncated(): boolean {
    return this.cut;
  }

  private trim(): void {
    const lines = this.text.split("\n");
    // A trailing newline leaves an empty last piece; it closes the line above
    // rather than opening a line of its own.
    const closed = lines.at(-1) === "";
    if (closed) {
      lines.pop();
    }

    if (lines.length > TAIL_LINES) {
      lines.splice(0, lines.length - TAIL_LINES);
      this.cut = true;
    }

    while (lines.length > 1 && Buffer.byteLength(join(lines, closed), "utf8") > TAIL_BYTES) {
      lines.shift();
      this.cut = true;
    }

    this.text = join(lines, closed);

    // One line longer than the whole limit is cut by bytes: there is no line
    // boundary left to cut at.
    const bytes = Buffer.from(this.text, "utf8");
    if (bytes.length > TAIL_BYTES) {
      this.text = bytes.subarray(bytes.length - TAIL_BYTES).toString("utf8");
      this.cut = true;
    }
  }
}

/**
 * Runs the command of a label through a shell and waits for it to finish.
 *
 * The shell is what runs it because projects write ordinary command lines —
 * `npm test && npm run lint:ci` — and splitting those by hand means writing
 * half a shell. Nothing is substituted into the line, so there is nothing to
 * inject into. There is no timeout: a test run of a large project takes tens
 * of minutes, and cutting it short would write a red stamp for work that was
 * going fine.
 */
export function runLabelCommand(options: RunCommandOptions): Promise<CommandRun> {
  const started = new Date();

  const tail = new Tail();

  return new Promise((resolve) => {
    const child = spawn(options.command, {
      cwd: options.cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    // The output is echoed as it arrives and kept in the tail at the same
    // time: the agent reads the whole run in the terminal, and only the end of
    // it goes into the ledger.
    child.stdout.on("data", (chunk: string) => {
      options.stdout.write(chunk);
      tail.add(chunk);
    });
    child.stderr.on("data", (chunk: string) => {
      options.stderr.write(chunk);
      tail.add(chunk);
    });

    const finish = (exitCode: number): void => {
      resolve({
        exitCode,
        startedAt: started.toISOString(),
        durationMs: Date.now() - started.getTime(),
        outputTail: tail.value,
        outputTruncated: tail.truncated,
      });
    };

    // A shell that cannot be started is the same story as a command that is
    // not there: the check never ran, and the caller refuses on that number.
    child.on("error", () => {
      finish(COMMAND_NOT_FOUND);
    });

    child.on("close", (code, signal) => {
      finish(code ?? SIGNAL_BASE + signalNumber(signal));
    });
  });
}

function signalNumber(signal: NodeJS.Signals | null): number {
  return signal ? (constants.signals[signal] ?? 0) : 0;
}
