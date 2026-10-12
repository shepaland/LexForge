import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { manifestPath, renderManifest } from "../../src/core/init/install-manifest.js";
import type { InstallScope } from "../../src/core/init/tool-registry.js";
import { toolDirectory } from "../../src/core/init/tool-registry.js";

export interface InstallationOptions {
  /** Whether `target` is the project root or the home directory. */
  scope: InstallScope;
  /** The version the manifest names, or `null` to write no manifest. */
  version: string | null;
  /** Skill directory names, each written with a one-line SKILL.md. */
  skills: string[];
}

/**
 * Lays out what an installation leaves behind for one tool: the skill
 * directories and, when a version is given, the install manifest next to them.
 * Returns the absolute skills directory.
 */
export function writeInstallation(
  target: string,
  tool: string,
  options: InstallationOptions,
): string {
  const directory = toolDirectory(tool, options.scope, target);
  const skillsDir = options.scope === "project" ? path.resolve(target, directory) : directory;

  mkdirSync(skillsDir, { recursive: true });
  for (const name of options.skills) {
    mkdirSync(path.join(skillsDir, name), { recursive: true });
    writeFileSync(path.join(skillsDir, name, "SKILL.md"), `# ${name}\n`, "utf8");
  }

  if (options.version !== null) {
    writeFileSync(
      manifestPath(skillsDir),
      renderManifest({
        version: options.version,
        installedAt: "2026-10-11T00:00:00.000Z",
        tool,
        scope: options.scope,
        files: options.skills.map((name) => `${name}/SKILL.md`),
      }),
      "utf8",
    );
  }

  return skillsDir;
}
