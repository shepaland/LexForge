import type { Command } from "commander";

import { initWorkspace } from "../../core/init/init-workspace.js";
import type { InstallScope } from "../../core/init/tool-registry.js";
import { knownTools } from "../../core/init/tool-registry.js";
import { UsageError } from "../errors.js";
import { renderResult } from "../render.js";
import type { CliContext } from "../run.js";

export const INIT_DESCRIPTION =
  "Create the lexforge/ workspace and install skills for the listed tools";

export function registerInit(program: Command, context: CliContext): void {
  program
    .command("init")
    .description(INIT_DESCRIPTION)
    .option("--tools <list>", `agents to install the skills for: ${knownTools().join(", ")}`)
    .option("--scope <scope>", "where the skills go: project or user", "project")
    .option("--language <code>", "language the artifacts of this project are written in")
    .option("--json", "print one JSON document instead of human output")
    .action((options: { tools?: string; scope?: string; language?: string; json?: boolean }) => {
      const result = initWorkspace({
        cwd: context.cwd,
        tools: splitList(options.tools),
        scope: readScope(options.scope),
        home: context.home,
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

const SCOPES: InstallScope[] = ["project", "user"];

/** The two places an installation can write. A third name is a refused call. */
function readScope(value?: string): InstallScope {
  const scope = (value ?? "project") as InstallScope;
  if (!SCOPES.includes(scope)) {
    throw new UsageError(
      "scope-unknown",
      `there is no scope named "${value}". Supported scopes: ${SCOPES.join(", ")}.`,
    );
  }

  return scope;
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
