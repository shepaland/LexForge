import { existsSync } from "node:fs";
import path from "node:path";

import { knownTools, toolDirectory } from "./tool-registry.js";

export interface DetectToolsOptions {
  /** The project root the search looks in. */
  root: string;
  /** The home directory the search looks in next to the project. */
  home: string;
}

/**
 * Runtimes whose directory is already there — in the project or in the home
 * directory. The search looks for the directory of the agent itself, not for
 * its skills: an agent that has never read a skill still has one.
 *
 * This is the one place that answers "is this runtime on the machine". The
 * installation check asks a different question — where LexForge is installed —
 * and answers it by the install manifest and the skill names, never by the
 * presence of a skills directory.
 *
 * A found directory is a suggestion and nothing more. Which runtime gets the
 * skills is a decision of the person, and it is made by naming `--tools`.
 */
export function detectTools(options: DetectToolsOptions): string[] {
  return knownTools().filter((tool) => {
    const inProject = path.resolve(options.root, toolDirectory(tool, "project"));
    const inHome = toolDirectory(tool, "user", options.home);

    return existsSync(path.dirname(inProject)) || existsSync(path.dirname(inHome));
  });
}
