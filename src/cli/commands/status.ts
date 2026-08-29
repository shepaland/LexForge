import type { Command } from "commander";

import { changeStatus, type ChangeStatusData } from "../../core/status/change-status.js";
import {
  workspaceStatus,
  type WorkspaceStatusData,
} from "../../core/status/workspace-status.js";
import type { CommandResult } from "../../core/types.js";
import { renderResult } from "../render.js";
import type { CliContext } from "../run.js";

export const STATUS_DESCRIPTION =
  "Show artifact status for one change or for every active change";

export function registerStatus(program: Command, context: CliContext): void {
  program
    .command("status")
    .description(STATUS_DESCRIPTION)
    .option("--change <name>", "change to report on; without it every active change is listed")
    .option("--json", "print one JSON document instead of human output")
    .action((options: { change?: string; json?: boolean }) => {
      const result: CommandResult<ChangeStatusData | WorkspaceStatusData> = options.change
        ? changeStatus({ cwd: context.cwd, change: options.change })
        : workspaceStatus({ cwd: context.cwd });

      renderResult(result, {
        json: Boolean(options.json),
        stdout: context.stdout,
        stderr: context.stderr,
      });
      context.finish(result);
    });
}
