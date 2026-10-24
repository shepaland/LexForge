import type { Command } from "commander";

import { readWorkflowFile } from "../../core/tasks/workflow-file.js";
import { validateChange } from "../../core/validation/validate-change.js";
import { readChangeConfig } from "../../core/workspace/change-config.js";
import { findWorkspaceRoot } from "../../core/workspace/find-root.js";
import { renderResult } from "../render.js";
import type { CliContext } from "../run.js";

export const VALIDATE_DESCRIPTION = "Check the artifacts and the requirements of a change";

export function registerValidate(program: Command, context: CliContext): void {
  program
    .command("validate")
    .description(VALIDATE_DESCRIPTION)
    .argument("<change>", "name of the change to check")
    .option("--strict", "add the completeness checks: purpose, placeholders, artifacts")
    .option("--json", "print one JSON document instead of human output")
    .action((change: string, options: { strict?: boolean; json?: boolean }) => {
      // The change is confirmed to exist before its workflow is read, so a
      // name the workspace does not have keeps change-not-found.
      const root = findWorkspaceRoot(context.cwd);
      readChangeConfig(root, change);
      readWorkflowFile(root, change);

      const result = validateChange({
        cwd: context.cwd,
        change,
        strict: Boolean(options.strict),
      });

      renderResult(result, {
        json: Boolean(options.json),
        stdout: context.stdout,
        stderr: context.stderr,
      });
      context.finish(result);
    });
}
