import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import type { InstallManifest } from "./install-manifest.js";
import { manifestPath, readManifest } from "./install-manifest.js";
import { isBuiltinSkillName } from "./plan-install.js";
import type { InstallScope } from "./tool-registry.js";
import { knownTools, toolDirectory } from "./tool-registry.js";

/** One skills directory that belongs to a LexForge installation. */
export interface Installation {
  tool: string;
  scope: InstallScope;
  /** The absolute skills directory. */
  skillsDir: string;
  /** The install manifest next to it; `undefined` when absent or unreadable. */
  manifest: InstallManifest | undefined;
  /** The absolute path the manifest is read from. */
  manifestFile: string;
}

export interface FindInstallationsOptions {
  /** The project root the project-scope skill directories are read under. */
  root: string;
  /** The home directory the user-scope skill directories are read under. */
  home: string;
}

/**
 * Whether this skills directory belongs to a LexForge installation: the install
 * manifest lies next to it, or it holds a skill directory of the `lexforge`
 * name family. A directory that holds only somebody else's skills is none of
 * this check's business — `~/.claude/skills` is there on every machine that
 * runs an agent, and its presence says nothing about LexForge.
 */
export function isInstallDirectory(skillsDir: string, manifestFile: string): boolean {
  if (existsSync(manifestFile)) {
    return true;
  }

  return readdirSync(skillsDir, { withFileTypes: true }).some(
    (entry) => entry.isDirectory() && isBuiltinSkillName(entry.name),
  );
}

/**
 * Every LexForge installation on this machine, for every known tool: the
 * project scope first, then the user scope, in the order of `knownTools()`.
 * A manifest that does not parse counts as absent.
 */
export function findInstallations(options: FindInstallationsOptions): Installation[] {
  const found: Installation[] = [];

  for (const tool of knownTools()) {
    for (const scope of ["project", "user"] as const) {
      const directory = toolDirectory(tool, scope, options.home);
      const skillsDir = scope === "project" ? path.resolve(options.root, directory) : directory;

      if (!statSync(skillsDir, { throwIfNoEntry: false })?.isDirectory()) {
        continue;
      }

      const manifestFile = manifestPath(skillsDir);
      if (!isInstallDirectory(skillsDir, manifestFile)) {
        continue;
      }

      const manifest = existsSync(manifestFile)
        ? readManifest(readFileSync(manifestFile, "utf8"))
        : undefined;

      found.push({ tool, scope, skillsDir, manifest, manifestFile });
    }
  }

  return found;
}
