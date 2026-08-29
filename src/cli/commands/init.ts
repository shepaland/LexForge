import type { Command } from "commander";

import { initWorkspace } from "../../core/init/init-workspace.js";
import { knownTools } from "../../core/init/tool-registry.js";
import { renderResult } from "../render.js";
import type { CliContext } from "../run.js";

export const INIT_DESCRIPTION =
  "Create the lexforge/ workspace and install skills for the listed tools";

export function registerInit(program: Command, context: CliContext): void {
  program
    .command("init")
    .description(INIT_DESCRIPTION)
    .option("--tools <list>", `agents to install the skills for: ${knownTools().join(", ")}`)
    .option("--language <code>", "language the artifacts of this project are written in")
    .option("--json", "print one JSON document instead of human output")
    .action((options: { tools?: string; language?: string; json?: boolean }) => {
      const result = initWorkspace({
        cwd: context.cwd,
        tools: splitList(options.tools),
        language: options.language,
      });

      renderResult(result, {
        json: Boolean(options.json),
        stdout: context.stdout,
        stderr: context.stderr,
      });
      context.finish(result);
    });
}

/** `--tools claude, codex` is the same list as `--tools claude,codex`. */
function splitList(value?: string): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
