import { UsageError } from "../../cli/errors.js";
import { answerPath } from "../answer-path.js";
import { assertRepository, readHead } from "../git/repository.js";
import { worktreeDigest } from "../git/worktree-digest.js";
import type { CommandResult, OutputStream } from "../types.js";
import { findWorkspaceRoot } from "../workspace/find-root.js";
import { readChangeConfig } from "../workspace/change-config.js";
import { putRedRun, readRedRuns, type RedRunRecord } from "./red-run-store.js";
import { commandNeverStarted, runLabelCommand } from "./run-command.js";

export interface RecordRedRunOptions {
  /** Any directory inside the project; the workspace root is looked up from it. */
  cwd: string;
  change: string;
  /** Task id, as `tasks.md` writes it. */
  task: string;
  /** The command to run, taken as given: nothing is substituted into it. */
  command: string;
  /** Where the output of the run is echoed while it runs. */
  stdout: OutputStream;
  stderr: OutputStream;
}

export interface RecordRedRunData {
  outputVersion: 1;
  workspaceRoot: string;
  change: string;
  task: string;
  /**
   * The record as it was written to the store. Absent when the run came back
   * green: nothing was written, and there is no record to show.
   */
  record?: RedRunRecord;
  nextStep: string;
}

/**
 * Runs the command of one task and, when it comes back red, writes the
 * record. The command is the only input: there is no way to hand in a
 * failing line, an exit code or an output tail without the CLI itself having
 * run the command that produced them.
 */
export async function recordRedRun(
  options: RecordRedRunOptions,
): Promise<CommandResult<RecordRedRunData>> {
  const root = findWorkspaceRoot(options.cwd);
  readChangeConfig(root, options.change);

  assertRepository(root);
  const head = readHead(root);
  // The store is read before the run: a broken file stops the command now
  // rather than after minutes of testing that nothing can be written down.
  readRedRuns(root, options.change);

  const run = await runLabelCommand({
    command: options.command,
    cwd: root,
    stdout: options.stdout,
    stderr: options.stderr,
  });

  // A run that never started is not a red run: there is nothing to record, and
  // a record saying "exit code 127" would read as a test that failed.
  if (commandNeverStarted({ exitCode: run.exitCode, command: options.command })) {
    throw new UsageError(
      "red-run-command-failed",
      `task ${options.task} runs "${options.command}", and the shell could not run it ` +
        `(exit code ${run.exitCode}). No record is written for a run that never started.`,
      `fix the command, then run: lexforge evidence red --change ${options.change} ` +
        `--task ${options.task} --command "${options.command}"`,
    );
  }

  // A run that came back green is not a red run either: the requirement this
  // command exists for is a failing test seen before the implementation, and
  // a green run has nothing to record.
  if (run.exitCode === 0) {
    const nextStep =
      "rewrite the test so it asserts the behaviour and run this command again, " +
      "or drop the task";

    return {
      data: {
        outputVersion: 1,
        workspaceRoot: answerPath(root),
        change: options.change,
        task: options.task,
        nextStep,
      },
      lines: [
        `Task ${options.task} ran "${options.command}" and it came back green ` +
          `(exit code 0). No record is written for a run that did not fail: ${nextStep}.`,
      ],
      nextStep,
      exitCode: 1,
    };
  }

  const record: RedRunRecord = {
    command: options.command,
    exitCode: run.exitCode,
    startedAt: run.startedAt,
    durationMs: run.durationMs,
    head,
    worktreeDigest: worktreeDigest(root),
    outputTail: run.outputTail,
    outputTruncated: run.outputTruncated,
  };

  putRedRun(root, options.change, options.task, record);

  const nextStep = `lexforge verify --change ${options.change}`;

  const data: RecordRedRunData = {
    outputVersion: 1,
    workspaceRoot: answerPath(root),
    change: options.change,
    task: options.task,
    record,
    nextStep,
  };

  return {
    data,
    lines: [
      `Task ${options.task} ran "${options.command}" and finished with exit code ` +
        `${record.exitCode} in ${record.durationMs} ms. The record is written.`,
    ],
    nextStep,
    exitCode: 0,
  };
}
