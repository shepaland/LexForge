import type { Command } from "commander";

import { resume, type ResumeData } from "../../core/tasks/resume.js";
import type { CommandResult } from "../../core/types.js";
import { findWorkspaceRoot } from "../../core/workspace/find-root.js";
import { renderResult } from "../render.js";
import type { CliContext } from "../run.js";

export const RESUME_DESCRIPTION = "Show where the change stands and the one next command, with the journal";

function entries(title: string, list: ResumeData["decisions"]): string[] {
  if (list.length === 0) return [];
  return [
    `${title}:`,
    ...list.map((entry) => `  ${entry.id}  ${entry.text}${entry.quote === null ? "" : ` (owner: "${entry.quote}")`}`),
  ];
}

function lines(data: ResumeData): string[] {
  const { progress } = data;
  return [
    `Change "${data.change}": ${progress.closed}/${progress.total} tasks closed, ${progress.inProgress} running, ` +
      `${progress.waiting} waiting, ${progress.blocked} blocked.`,
    ...data.running.map((item) => `  running ${item.task}: next ${item.stage}, worktree ${item.worktree}`),
    ...entries("Questions", data.questions),
    ...entries("Decisions", data.decisions),
    ...entries("Promises", data.promises),
    ...entries("Permissions", data.permissions),
    ...entries("Rulings", data.rulings),
  ];
}

export function registerResume(program: Command, context: CliContext): void {
  program
    .command("resume")
    .description(RESUME_DESCRIPTION)
    .allowExcessArguments(false)
    .requiredOption("--change <name>", "change to resume")
    .option("--json", "print one JSON document instead of human output")
    .action((options: { change: string; json?: boolean }) => {
      const root = findWorkspaceRoot(context.cwd);
      const data = resume(root, options.change);
      const result: CommandResult<unknown> = {
        data: { outputVersion: 1, ...data },
        lines: lines(data),
        nextStep: data.nextStep,
        exitCode: 0,
      };
      renderResult(result, { json: Boolean(options.json), stdout: context.stdout, stderr: context.stderr });
      context.finish(result);
    });
}
