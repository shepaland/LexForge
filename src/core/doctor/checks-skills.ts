import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { answerPath } from "../answer-path.js";
import { manifestPath, readManifest } from "../init/install-manifest.js";
import { builtinSkillsDir, isBuiltinSkillName } from "../init/plan-install.js";
import type { InstallScope } from "../init/tool-registry.js";
import { knownTools, toolDirectory } from "../init/tool-registry.js";
import { packageVersion } from "../package-info.js";
import type { DoctorFinding, HealthCheck } from "./checks.js";

export interface CheckSkillsOptions {
  /** The project root the project-scope skill directories are read under. */
  root: string;
  /** The home directory the user-scope skill directories are read under. */
  home?: string;
  /** The directory the shipped skills are compared against. */
  skillsDir?: string;
  /** The version findings compare an installed manifest against. */
  version?: string;
}

/**
 * The command that repairs a finding. It names the scope the directory sits in:
 * a finding about the user scope answered by an installation into the project
 * writes new files somewhere else and leaves the finding standing.
 */
function reinstallStep(tool: string, scope: InstallScope): string {
  return `lexforge init --tools ${tool}${scope === "user" ? " --scope user" : ""}`;
}

/**
 * Whether this skills directory belongs to a LexForge installation: the install
 * manifest lies next to it, or it holds a skill directory of the `lexforge`
 * name family. A directory that holds only somebody else's skills is none of
 * this check's business — `~/.claude/skills` is there on every machine that
 * runs an agent, and its presence says nothing about LexForge.
 */
function isInstallDirectory(skillsDir: string, manifestFile: string): boolean {
  if (existsSync(manifestFile)) {
    return true;
  }

  return readdirSync(skillsDir, { withFileTypes: true }).some(
    (entry) => entry.isDirectory() && isBuiltinSkillName(entry.name),
  );
}

/**
 * Condition 3: every installed skill directory this package could have
 * written — for every known tool, in the project and in the home directory —
 * matches the shipped skill byte for byte, and its manifest names the current
 * package version.
 *
 * The question here is not which runtimes this machine has: that one is asked
 * by `detectTools`, and it is answered by the directory of the agent itself.
 * This check looks for installations of LexForge, and a skills directory
 * without one is passed over.
 */
export function checkSkills(options: CheckSkillsOptions): HealthCheck {
  const home = options.home ?? os.homedir();
  const source = path.resolve(options.skillsDir ?? builtinSkillsDir());
  const version = options.version ?? packageVersion();
  const findings: DoctorFinding[] = [];
  let foundAny = false;

  for (const tool of knownTools()) {
    for (const scope of ["project", "user"] as const) {
      const directory = toolDirectory(tool, scope, home);
      const skillsDir = scope === "project" ? path.resolve(options.root, directory) : directory;

      if (!statSync(skillsDir, { throwIfNoEntry: false })?.isDirectory()) {
        continue;
      }

      const shownDir = answerPath(skillsDir);
      const manifestFile = manifestPath(skillsDir);
      if (!isInstallDirectory(skillsDir, manifestFile)) {
        continue;
      }
      foundAny = true;

      const manifest = existsSync(manifestFile)
        ? readManifest(readFileSync(manifestFile, "utf8"))
        : undefined;

      if (!manifest) {
        findings.push({
          rule: "skills-unmanaged",
          level: "error",
          message:
            `${shownDir} holds skills for ${tool} (${scope}) with no lexforge install ` +
            `manifest, so its contents are unknown. Run "${reinstallStep(tool, scope)}" to record it.`,
          path: shownDir,
        });
        continue;
      }

      if (manifest.version !== version) {
        findings.push({
          rule: "skills-version-mismatch",
          level: "error",
          message:
            `${shownDir} was installed by lexforge ${manifest.version}, this is ${version}. ` +
            `Run "${reinstallStep(tool, scope)}" to update it.`,
          path: shownDir,
        });
      }

      for (const file of manifest.files) {
        const installed = path.join(skillsDir, ...file.split("/"));
        const shipped = path.join(source, ...file.split("/"));
        const shownFile = answerPath(installed);

        if (!existsSync(installed)) {
          findings.push({
            rule: "skills-file-missing",
            level: "error",
            message:
              `${shownFile} is listed in the install manifest but missing on disk. ` +
              `Run "${reinstallStep(tool, scope)}" to reinstall it.`,
            path: shownFile,
          });
          continue;
        }

        if (!existsSync(shipped)) {
          continue;
        }

        // Compared as raw bytes, not decoded text: the spec calls this a
        // byte-for-byte comparison, and two different invalid byte sequences
        // can decode to the same replacement character.
        if (!readFileSync(installed).equals(readFileSync(shipped))) {
          findings.push({
            rule: "skills-modified",
            level: "error",
            message:
              `${shownFile} differs from the shipped skill. ` +
              `Run "${reinstallStep(tool, scope)}" to reinstall it.`,
            path: shownFile,
          });
        }
      }
    }
  }

  if (!foundAny) {
    findings.push({
      rule: "skills-not-installed",
      level: "error",
      message:
        "No skills are installed for any supported tool. " +
        `Run "lexforge init --tools <one of: ${knownTools().join(", ")}>" to install them.`,
    });
  }

  return { id: "skills", title: "Installed skills", findings };
}

/**
 * Whether the command found on `PATH` and the file this run started from belong
 * to one installation. On Linux and macOS they are the same file: the name on
 * `PATH` is the script itself, or a link the shell hands over as it was written.
 *
 * On Windows they never are. The name resolves to a wrapper — `lexforge.cmd` —
 * and the wrapper starts node on the JavaScript beside it, so comparing the two
 * paths would report every healthy installation as two. What is compared there
 * is the tree they live in: npm writes the wrapper either next to the
 * `node_modules` holding the package, or into the `node_modules/.bin` beside it.
 * Two installations lie in two different trees, and that is still told apart.
 */
export function sameInstallation(resolved: string, runningFile: string, windows: boolean): boolean {
  if (path.resolve(resolved) === path.resolve(runningFile)) {
    return true;
  }

  if (!windows) {
    return false;
  }

  const wrapperDir = path.dirname(path.resolve(resolved));
  const roots = [wrapperDir];
  if (path.basename(wrapperDir) === ".bin") {
    roots.push(path.dirname(wrapperDir));
  }

  return roots.some((root) => inside(root, path.resolve(runningFile)));
}

/** Whether the file lies under the directory, the directory itself aside. */
function inside(directory: string, file: string): boolean {
  const relative = path.relative(directory, file);

  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
