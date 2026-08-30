import type { Command } from "commander";

import { checkEvidence } from "../../core/gates/check-evidence.js";
import { checkPlan } from "../../core/gates/plan-check.js";
import { renderResult } from "../render.js";
import type { CliContext } from "../run.js";
import { refuseWithoutSubcommand } from "../subcommand-group.js";

export const CHECK_DESCRIPTION = "Run a gate over a change: the plan or the evidence";
export const CHECK_PLAN_DESCRIPTION = "Check the plan of a change for unwritten work";
export const CHECK_EVIDENCE_DESCRIPTION =
  "Check that the stamps of a change stand for the code on disk";

export function registerCheck(program: Command, context: CliContext): void {
  const group = program.command("check").description(CHECK_DESCRIPTION);

  refuseWithoutSubcommand(group);

  group
    .command("plan")
    .description(CHECK_PLAN_DESCRIPTION)
    .requiredOption("--change <name>", "change whose plan is checked")
    .option("--json", "print one JSON document instead of human output")
    .action((options: { change: string; json?: boolean }) => {
      const result = checkPlan({ cwd: context.cwd, change: options.change });

      renderResult(result, {
        json: Boolean(options.json),
        stdout: context.stdout,
        stderr: context.stderr,
      });
      context.finish(result);
    });

  group
    .command("evidence")
    .description(CHECK_EVIDENCE_DESCRIPTION)
    .allowExcessArguments(false)
    .requiredOption("--change <name>", "change whose stamps are checked")
    .option("--require <labels>", "check only these labels, separated by commas")
    .option("--json", "print one JSON document instead of human output")
    .action((options: { change: string; require?: string; json?: boolean }) => {
      const result = checkEvidence({
        cwd: context.cwd,
        change: options.change,
        require: options.require,
      });

      renderResult(result, {
        json: Boolean(options.json),
        stdout: context.stdout,
        stderr: context.stderr,
      });
      context.finish(result);
    });
}
