import type { Command } from "commander";

import { UsageError } from "../errors.js";
import {
  configNeedsMigration,
  migrateChange,
  migrateConfig,
  pendingChanges,
  type MigrationResult,
} from "../../core/tasks/migrate.js";
import type { CommandResult } from "../../core/types.js";
import { findWorkspaceRoot } from "../../core/workspace/find-root.js";
import { renderResult } from "../render.js";
import type { CliContext } from "../run.js";

export const MIGRATE_DESCRIPTION = "Carry the config and the changes of LexForge 5.x over to 6.0.0";

function changeLines(result: MigrationResult): string[] {
  return [
    `Change "${result.change}": ${result.closed.length} closed from history, ` +
      `${result.reopened.length} reopened, ${result.open.length} open; ` +
      (result.approved ? "plan approved as migrated from 5.x." : "plan not approved."),
    ...result.missingFields.map((item) => `  task ${item.task} lacks ${item.fields.join(", ")}`),
  ];
}

export function registerMigrate(program: Command, context: CliContext): void {
  program
    .command("migrate")
    .description(MIGRATE_DESCRIPTION)
    .allowExcessArguments(false)
    .option("--change <name>", "carry over only this change; without it the config and every change")
    .option("--json", "print one JSON document instead of human output")
    .action((options: { change?: string; json?: boolean }) => {
      const root = findWorkspaceRoot(context.cwd);
      let config = { changed: false, removed: [] as string[] };
      let changes: MigrationResult[];
      if (options.change !== undefined) {
        changes = [migrateChange(root, options.change)];
      } else {
        const pending = pendingChanges(root);
        if (!configNeedsMigration(root) && pending.length === 0) {
          throw new UsageError(
            "already-migrated",
            "the config and every change already run on LexForge 6.0.0; nothing was written.",
            "lexforge status",
          );
        }
        config = migrateConfig(root);
        changes = pending.map((change) => migrateChange(root, change));
      }
      const nextStep = (changes.find((item) => !item.approved) ?? changes[0])?.nextStep ?? "lexforge status";
      const result: CommandResult<unknown> = {
        data: { outputVersion: 1, config, changes, nextStep },
        lines: [
          config.changed ? `config.yaml: removed ${config.removed.join(", ")}.` : "config.yaml: nothing to remove.",
          ...changes.flatMap(changeLines),
        ],
        nextStep,
        exitCode: 0,
      };
      renderResult(result, { json: Boolean(options.json), stdout: context.stdout, stderr: context.stderr });
      context.finish(result);
    });
}
