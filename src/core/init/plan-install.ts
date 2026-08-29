import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { UsageError } from "../../cli/errors.js";
import { knownTools, TOOL_DIRECTORIES } from "./tool-registry.js";

/** `skills/` sits next to `src/` and `dist/`, three levels above this module. */
export function builtinSkillsDir(): string {
  return fileURLToPath(new URL("../../../skills", import.meta.url));
}

export type InstallState = "created" | "updated" | "unchanged";

export interface InstallEntry {
  path: string;
  content: string;
  state: InstallState;
}

export interface PlanInstallOptions {
  /** The project root the skill directories are written under. */
  root: string;
  tools: string[];
  skillsDir?: string;
}

/**
 * Works out every file the installation would write, and writes nothing. All
 * tool names are checked first, so an unknown name stops the run before the
 * first file lands on disk.
 */
export function planSkillInstall(options: PlanInstallOptions): InstallEntry[] {
  const directories = options.tools.map((tool) => {
    const directory = TOOL_DIRECTORIES[tool];
    if (!directory) {
      throw new UsageError(
        "tool-unknown",
        `there is no tool named "${tool}". Supported tools: ${knownTools().join(", ")}.`,
      );
    }
    return directory;
  });

  const source = path.resolve(options.skillsDir ?? builtinSkillsDir());
  const files = existsSync(source) ? walk(source) : [];
  const root = path.resolve(options.root);

  const plan: InstallEntry[] = [];
  for (const directory of directories) {
    for (const relative of files) {
      const target = path.join(root, directory, relative);
      const content = readFileSync(path.join(source, relative), "utf8");
      plan.push({ path: target, content, state: stateOf(target, content) });
    }
  }

  return plan;
}

/** A file that already holds the shipped text is left alone, not rewritten. */
function stateOf(target: string, content: string): InstallState {
  if (!existsSync(target)) {
    return "created";
  }
  return readFileSync(target, "utf8") === content ? "unchanged" : "updated";
}

/** Every file under `dir`, as paths relative to it, sorted for a stable plan. */
function walk(dir: string, prefix = ""): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true }).sort(byName)) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      found.push(...walk(path.join(dir, entry.name), relative));
    } else if (entry.isFile()) {
      found.push(relative);
    }
  }

  return found;
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}
