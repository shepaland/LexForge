import type { Command } from "commander";

import { finalPackageStep, registerFinalReview, writeFinalPackage } from "../../core/tasks/final-review.js";
import { assertMigrated } from "../../core/tasks/workflow-file.js";
import type { CommandResult } from "../../core/types.js";
import { findWorkspaceRoot } from "../../core/workspace/find-root.js";
import { renderResult } from "../render.js";
import type { CliContext } from "../run.js";
import { refuseWithoutSubcommand } from "../subcommand-group.js";

export const REVIEW_DESCRIPTION = "Review the whole change once every task is closed: final";

function respond(context: CliContext, json: boolean | undefined, data: { nextStep: string; summary: string; [key: string]: unknown }): void {
  const result: CommandResult<unknown> = {
    data: { outputVersion: 1, ...data },
    lines: [data.summary],
    nextStep: data.nextStep,
    exitCode: 0,
  };
  renderResult(result, { json: Boolean(json), stdout: context.stdout, stderr: context.stderr });
  context.finish(result);
}

export function registerReview(program: Command, context: CliContext): void {
  const group = program.command("review").description(REVIEW_DESCRIPTION);
  group
    .command("final")
    .description("Write the final review package, or register the reviewer's report with --file")
    .allowExcessArguments(false)
    .requiredOption("--change <name>", "change to review")
    .option("--file <report>", "the final reviewer's report")
    .option("--json", "print one JSON document instead of human output")
    .action((options: { change: string; file?: string; json?: boolean }) => {
      const root = findWorkspaceRoot(context.cwd);
      assertMigrated(root, options.change);
      if (options.file === undefined) {
        const file = writeFinalPackage(root, options.change);
        respond(context, options.json, {
          file,
          nextStep: finalPackageStep(options.change),
          summary: `Final review package of ${options.change} written to ${file}.`,
        });
        return;
      }
      const result = registerFinalReview(root, options.change, options.file);
      respond(context, options.json, {
        ...result,
        summary: `Final review of ${options.change} registered: ${result.verdict}, ${result.findings.length} finding(s).`,
      });
    });
  refuseWithoutSubcommand(group);
}
