import path from "node:path";
import type { Command } from "commander";

import { abandonTask } from "../../core/tasks/abandon.js";
import { closeTask } from "../../core/tasks/close.js";
import { recordGreen, recordRed } from "../../core/tasks/red-green.js";
import { registerTaskReview } from "../../core/tasks/review.js";
import { UsageError } from "../errors.js";
import { unlockChange } from "../../core/tasks/lock.js";
import { startTask } from "../../core/tasks/start.js";
import type { CommandResult } from "../../core/types.js";
import { findWorkspaceRoot } from "../../core/workspace/find-root.js";
import { renderResult } from "../render.js";
import type { CliContext } from "../run.js";
import { refuseWithoutSubcommand } from "../subcommand-group.js";

export const TASK_DESCRIPTION = "Run one task of an approved plan: start, red, green, review, close, abandon";

interface Flags {
  change: string;
  task: string;
  json?: boolean;
}

/** Prints a result of the core: the data holds `nextStep` and the summary line. */
function respond(context: CliContext, json: boolean | undefined, data: { nextStep: string; summary: string }): void {
  const result: CommandResult<unknown> = {
    data: { outputVersion: 1, ...data },
    lines: [data.summary],
    nextStep: data.nextStep,
    exitCode: 0,
  };
  renderResult(result, {
    json: Boolean(json),
    stdout: context.stdout,
    stderr: context.stderr,
  });
  context.finish(result);
}

const AGAIN = /(?:,\s*)?(?:then )?run this command again$/;

/**
 * Runs a task command. A refusal from shared code that says "run this command again"
 * names the command itself, so every refusal of a task command ends in a command to run.
 */
function naming(command: string, work: () => void): void {
  try {
    work();
  } catch (error) {
    if (error instanceof UsageError && AGAIN.test(error.nextStep)) {
      throw new UsageError(
        error.code,
        error.message,
        error.nextStep.replace(AGAIN, `, then run: ${command}`),
        error.path,
      );
    }
    throw error;
  }
}

/** The full command line of a task subcommand, with the flags it was given. */
function again(verb: string, options: Flags & { executor?: string; file?: string }): string {
  const extra =
    options.executor !== undefined
      ? ` --executor ${options.executor}`
      : options.file !== undefined
        ? ` --file ${options.file}`
        : "";
  return `lexforge task ${verb} --change ${options.change} --task ${options.task}${extra}`;
}

function subcommand(group: Command, name: string, description: string): Command {
  return group
    .command(name)
    .description(description)
    .allowExcessArguments(false)
    .requiredOption("--change <name>", "change the task belongs to")
    .requiredOption("--task <id>", "task number in the plan")
    .option("--json", "print one JSON document instead of human output");
}

export function registerTask(program: Command, context: CliContext): void {
  const group = program.command("task").description(TASK_DESCRIPTION);
  refuseWithoutSubcommand(group);

  subcommand(group, "start", "Open the task's worktree and write its brief")
    .requiredOption("--executor <id>", "who carries the task out")
    .action((options: Flags & { executor: string }) =>
      naming(again("start", options), () => {
        const root = findWorkspaceRoot(context.cwd);
        const result = startTask(root, options.change, options.task, options.executor);
        respond(context, options.json, {
          ...result,
          summary: `Started task ${options.task} in ${result.worktree} on ${result.branch}. Brief: ${result.brief}`,
        });
      }),
    );

  subcommand(group, "red", "Run the task's command on the test commit and record the failure").action(
    (options: Flags) =>
      naming(again("red", options), () => {
        const root = findWorkspaceRoot(context.cwd);
        const result = recordRed(root, options.change, options.task);
        respond(context, options.json, {
          ...result,
          summary: `Task ${options.task} is red on ${result.commit.slice(0, 12)}: the command exited ${result.exitCode}.`,
        });
      }),
  );

  subcommand(group, "green", "Run the task's command on the implementation commit and write the review package").action(
    (options: Flags) =>
      naming(again("green", options), () => {
        const root = findWorkspaceRoot(context.cwd);
        const result = recordGreen(root, options.change, options.task);
        respond(context, options.json, {
          ...result,
          summary: `Task ${options.task} is green on ${result.commit.slice(0, 12)}. Review package: ${result.reviewPackage}`,
        });
      }),
  );

  subcommand(group, "review", "Register a reviewer's report against the task's green commit")
    .requiredOption("--file <report.md>", "the review report")
    .action((options: Flags & { file: string }) =>
      naming(again("review", options), () => {
        const root = findWorkspaceRoot(context.cwd);
        const result = registerTaskReview(root, options.change, options.task, path.resolve(context.cwd, options.file));
        respond(context, options.json, {
          ...result,
          summary: `Registered the review of task ${options.task}: ${result.verdict}, ${result.findings.length} findings.`,
        });
      }),
    );

  subcommand(group, "close", "Check the task in git, merge it into the change branch and tick it").action(
    (options: Flags) =>
      naming(again("close", options), () => {
        const root = findWorkspaceRoot(context.cwd);
        const result = closeTask(root, options.change, options.task);
        respond(context, options.json, {
          ...result,
          summary:
            `Closed task ${options.task} with merge ${result.merge.slice(0, 12)}: ` +
            `${result.progress.closed} of ${result.progress.total} tasks closed.`,
        });
      }),
  );

  subcommand(group, "abandon", "Remove the task's worktree and branch so the task can start over").action(
    (options: Flags) =>
      naming(again("abandon", options), () => {
        const root = findWorkspaceRoot(context.cwd);
        const result = abandonTask(root, options.change, options.task);
        respond(context, options.json, {
          ...result,
          summary: `Abandoned task ${options.task}; attempts so far: ${result.attempts}.`,
        });
      }),
  );
}

export function registerUnlock(program: Command, context: CliContext): void {
  program
    .command("unlock")
    .description("Remove the lock of a change left by a process that is no longer running")
    .allowExcessArguments(false)
    .requiredOption("--change <name>", "change whose lock to remove")
    .option("--json", "print one JSON document instead of human output")
    .action((options: { change: string; json?: boolean }) =>
      naming(`lexforge unlock --change ${options.change}`, () => {
        const root = findWorkspaceRoot(context.cwd);
        const result = unlockChange(root, options.change);
        respond(context, options.json, {
          ...result,
          nextStep: `lexforge status --change ${options.change}`,
          summary: result.removed
            ? `Removed the lock of ${options.change} left by process ${result.pid ?? "unknown"}.`
            : `The change ${options.change} holds no lock.`,
        });
      }),
    );
}
