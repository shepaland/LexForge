import path from "node:path";

import { UsageError } from "../cli/errors.js";
import { answerPath } from "./answer-path.js";
import { findInstallations } from "./init/installations.js";
import { findWorkspaceRoot } from "./workspace/find-root.js";

export interface SkillGateOptions {
  /** The directory the command runs in. */
  cwd: string;
  /** The home directory the user-scope skill directories are read under. */
  home: string;
  /** The running CLI version every installation must name. */
  version: string;
}

/** The project root: the workspace root, or `cwd` when there is no workspace. */
function projectRoot(cwd: string): string {
  try {
    return findWorkspaceRoot(cwd);
  } catch (error) {
    if (error instanceof UsageError) {
      return path.resolve(cwd);
    }
    throw error;
  }
}

/**
 * Refuses a command while an installed LexForge skill set was written by
 * another version of the CLI, or has no manifest. Reads local files only.
 */
export function checkSkillVersions(options: SkillGateOptions): void {
  const installations = findInstallations({
    root: projectRoot(options.cwd),
    home: options.home,
  });

  for (const { tool, scope, skillsDir, manifest } of installations) {
    if (manifest?.version === options.version) {
      continue;
    }

    const installed = manifest ? manifest.version : "unknown";
    const repair = `lexforge init --tools ${tool}${scope === "user" ? " --scope user" : ""}`;

    throw new UsageError(
      "skills-outdated",
      `The skills in ${answerPath(skillsDir)} were installed by lexforge ${installed}, ` +
        `and this is lexforge ${options.version}. Run "${repair}" to update them.`,
      repair,
      answerPath(skillsDir),
    );
  }
}
