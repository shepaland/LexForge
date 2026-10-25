import type { Command } from "commander";

import {
  MAX_FILES,
  MAX_PATH_LENGTH,
  MAX_SELECTED_RULES,
  selectRules,
  type SelectedRule,
} from "../../core/rules/select.js";
import { loadCatalog } from "../../core/rules/catalog.js";
import type { CommandResult } from "../../core/types.js";
import { readChangeConfig } from "../../core/workspace/change-config.js";
import { findWorkspaceRoot } from "../../core/workspace/find-root.js";
import { readProjectConfig } from "../../core/workspace/project-config.js";
import { UsageError } from "../errors.js";
import { renderResult } from "../render.js";
import type { CliContext } from "../run.js";

export const RULES_DESCRIPTION = "Print the engineering rules that apply to a set of files";

interface RulesData {
  outputVersion: 1;
  change: string;
  rules: SelectedRule[];
  nextStep: string;
}

interface RulesRefusal {
  outputVersion: 1;
  change: string;
  error: { code: string; message: string };
  nextStep: string;
}

function refuse(
  change: string,
  code: string,
  message: string,
  nextStep: string,
): CommandResult<RulesRefusal> {
  return {
    data: { outputVersion: 1, change, error: { code, message }, nextStep },
    lines: [`${code}: ${message}`],
    nextStep,
    exitCode: 1,
  };
}

export function registerRules(program: Command, context: CliContext): void {
  program
    .command("rules")
    .description(RULES_DESCRIPTION)
    .requiredOption("--change <name>", "the change the files belong to")
    .requiredOption("--files <paths...>", "the files of the task, relative to the project root")
    .option("--json", "print one JSON document instead of human output")
    .action((options: { change: string; files: string[]; json?: boolean }) => {
      const root = findWorkspaceRoot(context.cwd);
      readChangeConfig(root, options.change);

      let result: CommandResult<RulesData | RulesRefusal>;
      if (options.files.length > MAX_FILES) {
        result = refuse(
          options.change,
          "files-too-many",
          `${options.files.length} files were given, the limit is ${MAX_FILES}. Split the task.`,
          `Run the command for at most ${MAX_FILES} files at a time.`,
        );
      } else {
        const badPath = options.files.find((file) => file.length === 0 || file.length > MAX_PATH_LENGTH);
        if (badPath !== undefined) {
          throw new UsageError(
            "path-too-long",
            `a path of ${badPath.length} characters was given, the length must be 1 to ${MAX_PATH_LENGTH}.`,
            "Give the path relative to the project root.",
          );
        }

        const config = readProjectConfig(root);
        const catalog = loadCatalog({
          root,
          stacks: config.engineering.stacks,
          disabled: config.engineering.disabled,
        });
        const selected = selectRules(catalog, options.files);
        if (selected.length > MAX_SELECTED_RULES) {
          result = refuse(
            options.change,
            "rules-too-many",
            `${selected.length} rules match these files, the limit is ${MAX_SELECTED_RULES}. Split the task.`,
            "Choose the files so that fewer rules match, then run the command again.",
          );
        } else {
          const nextStep = "Put these rules into the brief of the executor and the reviewer.";
          result = {
            data: { outputVersion: 1, change: options.change, rules: selected, nextStep },
            lines: selected.map((rule) => `${rule.id} ${rule.rule} Sign: ${rule.sign}`),
            nextStep,
            exitCode: 0,
          };
        }
      }

      renderResult(result, {
        json: Boolean(options.json),
        stdout: context.stdout,
        stderr: context.stderr,
      });
      context.finish(result);
    });
}
