import type { Command } from "commander";

import { artifactInstructions } from "../../core/instructions/artifact-instructions.js";
import { assertMigrated } from "../../core/tasks/workflow-file.js";
import { findWorkspaceRoot } from "../../core/workspace/find-root.js";
import { renderResult } from "../render.js";
import type { CliContext } from "../run.js";

export const INSTRUCTIONS_DESCRIPTION =
  "Show template, context, rules and instruction for one artifact";

export function registerInstructions(program: Command, context: CliContext): void {
  program
    .command("instructions <artifact>")
    .description(INSTRUCTIONS_DESCRIPTION)
    .requiredOption("--change <name>", "change the artifact belongs to")
    .option("--tool <name>", "runtime this call comes from; without it no runtime is named")
    .option("--json", "print one JSON document instead of human output")
    .action((artifact: string, options: { change: string; tool?: string; json?: boolean }) => {
      assertMigrated(findWorkspaceRoot(context.cwd), options.change);

      const result = artifactInstructions({
        cwd: context.cwd,
        change: options.change,
        artifact,
        tool: options.tool,
      });

      renderResult(result, {
        json: Boolean(options.json),
        stdout: context.stdout,
        stderr: context.stderr,
      });
      context.finish(result);
    });
}
