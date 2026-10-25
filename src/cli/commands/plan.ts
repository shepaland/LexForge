import type { Command } from "commander";

import { amendPlan } from "../../core/tasks/plan-amend.js";
import { approvePlan } from "../../core/tasks/plan-approve.js";
import { registerPlanReview } from "../../core/tasks/plan-review.js";
import { escalate } from "../../core/tasks/short-path.js";
import { assertMigrated } from "../../core/tasks/workflow-file.js";
import type { CommandResult } from "../../core/types.js";
import { findWorkspaceRoot } from "../../core/workspace/find-root.js";
import { renderResult } from "../render.js";
import type { CliContext } from "../run.js";
import { refuseWithoutSubcommand } from "../subcommand-group.js";

export const PLAN_DESCRIPTION = "Review, approve and amend the plan of a change";
export const PLAN_APPROVE_DESCRIPTION = "Approve the reviewed plan with the owner's words";
export const PLAN_AMEND_DESCRIPTION = "Accept a change of the approved plan";
export const PLAN_ESCALATE_DESCRIPTION = "Move a short change to the full path";
export const PLAN_REVIEW_DESCRIPTION = "Register a review report of the plan from one angle";

interface Flags {
  change: string;
  json?: boolean;
}

/** Wraps a result of the core into the shape every command prints: the data holds `nextStep`. */
function respond(
  context: CliContext,
  json: boolean | undefined,
  data: { nextStep: string; summary: string },
): void {
  const result: CommandResult<unknown> = {
    data: { outputVersion: 1, ...data },
    lines: [data.summary],
    nextStep: data.nextStep,
    exitCode: 0,
  };
  renderResult(result, { json: Boolean(json), stdout: context.stdout, stderr: context.stderr });
  context.finish(result);
}

export function registerPlan(program: Command, context: CliContext): void {
  const group = program.command("plan").description(PLAN_DESCRIPTION);
  refuseWithoutSubcommand(group);

  group
    .command("review")
    .description(PLAN_REVIEW_DESCRIPTION)
    .allowExcessArguments(false)
    .requiredOption("--change <name>", "change whose plan is reviewed")
    .option("--angle <angle>", "specs, code, dependencies, gaps or amendment")
    .requiredOption("--file <report.md>", "the review report")
    .option("--json", "print one JSON document instead of human output")
    .action((options: Flags & { angle?: string; file: string }) => {
      const root = findWorkspaceRoot(context.cwd);
      assertMigrated(root, options.change);
      const result = registerPlanReview(root, options.change, options.angle ?? "", options.file);
      const found = result.findings.length;
      respond(context, options.json, {
        ...result,
        summary: `Registered the ${result.angle} review of change "${options.change}": ${result.verdict}, ${found} findings.`,
      });
    });

  group
    .command("approve")
    .description(PLAN_APPROVE_DESCRIPTION)
    .allowExcessArguments(false)
    .requiredOption("--change <name>", "change whose plan is approved")
    .option("--quote <words>", "the owner's own words that approve the plan")
    .option("--json", "print one JSON document instead of human output")
    .action((options: Flags & { quote?: string }) => {
      const root = findWorkspaceRoot(context.cwd);
      assertMigrated(root, options.change);
      const result = approvePlan(root, options.change, options.quote);
      respond(context, options.json, {
        ...result,
        summary: `Approved the plan of change "${options.change}" at ${result.digest.slice(0, 12)}, base ${result.base.slice(0, 12)}.`,
      });
    });

  group
    .command("amend")
    .description(PLAN_AMEND_DESCRIPTION)
    .allowExcessArguments(false)
    .requiredOption("--change <name>", "change whose approved plan is amended")
    .option("--quote <words>", "the owner's own words that allow the amendment")
    .option("--json", "print one JSON document instead of human output")
    .action((options: Flags & { quote?: string }) => {
      const root = findWorkspaceRoot(context.cwd);
      assertMigrated(root, options.change);
      const result = amendPlan(root, options.change, options.quote);
      respond(context, options.json, {
        ...result,
        summary: `Recorded an amendment of the plan of change "${options.change}": ${result.changedTasks.length} tasks changed.`,
      });
    });

  group
    .command("escalate")
    .description(PLAN_ESCALATE_DESCRIPTION)
    .allowExcessArguments(false)
    .requiredOption("--change <name>", "short change that moves to the full path")
    .option("--json", "print one JSON document instead of human output")
    .action((options: Flags) => {
      const root = findWorkspaceRoot(context.cwd);
      // Before the lock of `escalate` below, which creates the change
      // directory on the way to taking it: a name the workspace does not
      // have must keep change-not-found, not answer change-needs-migration
      // out of a directory it never had.
      assertMigrated(root, options.change);
      const result = escalate(root, options.change);
      respond(context, options.json, {
        ...result,
        summary: `Change "${options.change}" is on the full path: the plan goes through review and approval.`,
      });
    });
}
