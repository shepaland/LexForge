import type { Command } from "commander";

import { closeDefect } from "../../core/defects/close.js";
import { listDefects } from "../../core/defects/list.js";
import { recordDefect } from "../../core/defects/record.js";
import { renderResult } from "../render.js";
import type { CliContext } from "../run.js";
import { refuseWithoutSubcommand } from "../subcommand-group.js";

export const DEFECT_DESCRIPTION = "Work with the project's defect ledger";
export const DEFECT_RECORD_DESCRIPTION = "Record one defect found in a change";
export const DEFECT_CLOSE_DESCRIPTION = "Mark one recorded defect as fixed";
export const DEFECT_LIST_DESCRIPTION = "List the defects the project has recorded";

export function registerDefect(program: Command, context: CliContext): void {
  const group = program.command("defect").description(DEFECT_DESCRIPTION);
  refuseWithoutSubcommand(group);

  group
    .command("record")
    .description(DEFECT_RECORD_DESCRIPTION)
    // Nothing beyond the flags below is taken: an argument the ledger quietly
    // ignores is the first place a way around it gets tried.
    .allowExcessArguments(false)
    .requiredOption("--change <name>", "change the defect was found in")
    .option("--level <level>", "critical, important or minor")
    .option("--file <path>", "file the defect is in")
    .option("--line <number>", "line number the defect is at")
    .option("--summary <text>", "one-line description of the defect")
    .option("--json", "print one JSON document instead of human output")
    .action(
      async (options: {
        change: string;
        level?: string;
        file?: string;
        line?: string;
        summary?: string;
        json?: boolean;
      }) => {
        const result = await recordDefect({
          cwd: context.cwd,
          change: options.change,
          level: options.level,
          file: options.file,
          line: options.line,
          summary: options.summary,
        });

        renderResult(result, {
          json: Boolean(options.json),
          stdout: context.stdout,
          stderr: context.stderr,
        });
        context.finish(result);
      },
    );

  group
    .command("close")
    .description(DEFECT_CLOSE_DESCRIPTION)
    .argument("<id>", "identifier of the defect to close")
    // Closing is the only change this command makes: no flag edits an
    // entry's text, and no flag removes one.
    .allowExcessArguments(false)
    .option("--json", "print one JSON document instead of human output")
    .action(async (id: string, options: { json?: boolean }) => {
      const result = await closeDefect({ cwd: context.cwd, id });

      renderResult(result, {
        json: Boolean(options.json),
        stdout: context.stdout,
        stderr: context.stderr,
      });
      context.finish(result);
    });

  group
    .command("list")
    .description(DEFECT_LIST_DESCRIPTION)
    // `--change` narrows the list; it does not select one entry the way it
    // does for `record` and `close`, so it is not required here.
    .allowExcessArguments(false)
    .option("--change <name>", "narrow to one change; without it, every change is listed")
    .option("--open", "narrow to entries whose state is open")
    .option("--json", "print one JSON document instead of human output")
    .action((options: { change?: string; open?: boolean; json?: boolean }) => {
      const result = listDefects({
        cwd: context.cwd,
        change: options.change,
        open: options.open,
      });

      renderResult(result, {
        json: Boolean(options.json),
        stdout: context.stdout,
        stderr: context.stderr,
      });
      context.finish(result);
    });
}
