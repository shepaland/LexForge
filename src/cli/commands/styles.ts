import type { Command } from "commander";

import { answerPath } from "../../core/answer-path.js";
import { findStyles, setStyles } from "../../core/styles/find-styles.js";
import type { CommandResult } from "../../core/types.js";
import { findWorkspaceRoot } from "../../core/workspace/find-root.js";
import { renderResult } from "../render.js";
import type { CliContext } from "../run.js";
import { refuseWithoutSubcommand } from "../subcommand-group.js";

export const STYLES_DESCRIPTION = "Name the project CSS the mockups are checked against";
export const STYLES_FIND_DESCRIPTION = "List the CSS files of the project";
export const STYLES_SET_DESCRIPTION = "Write the chosen CSS files to ui.styles in the config";

export function registerStyles(program: Command, context: CliContext): void {
  const group = program.command("styles").description(STYLES_DESCRIPTION);
  refuseWithoutSubcommand(group);

  group
    .command("find")
    .description(STYLES_FIND_DESCRIPTION)
    .allowExcessArguments(false)
    .option("--json", "print one JSON document instead of human output")
    .action((options: { json?: boolean }) => {
      const paths = findStyles(findWorkspaceRoot(context.cwd));
      const nextStep =
        paths.length > 0
          ? `lexforge styles set ${paths[0]}`
          : "No CSS files found: draw the mockup without a project stylesheet, or add one and run lexforge styles set with its path.";
      const result: CommandResult<{ outputVersion: 1; styles: string[]; nextStep: string }> = {
        data: { outputVersion: 1, styles: paths, nextStep },
        lines: paths.length > 0 ? paths : ["No CSS files found."],
        nextStep,
        exitCode: 0,
      };

      renderResult(result, {
        json: Boolean(options.json),
        stdout: context.stdout,
        stderr: context.stderr,
      });
      context.finish(result);
    });

  group
    .command("set")
    .description(STYLES_SET_DESCRIPTION)
    .argument("<paths...>", "CSS files of the project, relative to its root")
    .option("--json", "print one JSON document instead of human output")
    .action((paths: string[], options: { json?: boolean }) => {
      const root = findWorkspaceRoot(context.cwd);
      const written = setStyles(root, paths.map((given) => answerPath(given)));
      const nextStep =
        "Draw the mockup against these styles; lexforge validate --strict checks its classes.";
      const result: CommandResult<{ outputVersion: 1; styles: string[]; nextStep: string }> = {
        data: { outputVersion: 1, styles: written, nextStep },
        lines: [`ui.styles holds ${written.join(", ")}.`],
        nextStep,
        exitCode: 0,
      };

      renderResult(result, {
        json: Boolean(options.json),
        stdout: context.stdout,
        stderr: context.stderr,
      });
      context.finish(result);
    });
}
