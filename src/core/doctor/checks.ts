import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { UsageError } from "../../cli/errors.js";
import { tryGit } from "../git/repository.js";
import { manifestPath, readManifest } from "../init/install-manifest.js";
import { builtinSkillsDir } from "../init/plan-install.js";
import { knownTools, toolDirectory } from "../init/tool-registry.js";
import { packageVersion, requiredNodeVersion } from "../package-info.js";
import { findWorkspaceRoot } from "../workspace/find-root.js";
import { readProjectConfig } from "../workspace/project-config.js";

/**
 * Every finding of an installation check is fatal to the "is this install
 * healthy" question: there is no softer level here, only present or absent.
 */
export type DoctorFindingLevel = "error";

/** One condition an installation check found wrong. */
export interface DoctorFinding {
  /** Rule id, stable across runs, such as `workspace-not-found`. */
  rule: string;
  level: DoctorFindingLevel;
  /** One plain sentence naming what is wrong and the command that fixes it. */
  message: string;
  /** Path the finding is about, when it is about a file. */
  path?: string;
}

/** One of the conditions `lexforge doctor` reports on, pass or fail. */
export interface HealthCheck {
  /** Stable id of the condition, such as `workspace`. */
  id: string;
  /** Human-readable name of the condition, printed whether it passed or not. */
  title: string;
  findings: DoctorFinding[];
}

/** Turns the `UsageError` a workspace lookup throws into a finding. */
function workspaceFinding(error: UsageError): DoctorFinding {
  const nextStep = error.nextStep ? ` Run: ${error.nextStep}` : "";
  return { rule: error.code, level: "error", message: `${error.message}${nextStep}` };
}

/**
 * Condition 1: the `lexforge/` workspace is set up and `config.yaml` reads
 * without error. `findWorkspaceRoot` and `readProjectConfig` both throw a
 * `UsageError` for every other command; here that state is a finding, not a
 * refusal to run.
 */
export function checkWorkspace(cwd: string): HealthCheck {
  const findings: DoctorFinding[] = [];

  try {
    const root = findWorkspaceRoot(cwd);
    readProjectConfig(root);
  } catch (error) {
    if (!(error instanceof UsageError)) {
      throw error;
    }
    findings.push(workspaceFinding(error));
  }

  return { id: "workspace", title: "Workspace and configuration", findings };
}

const VERIFICATION_EXAMPLE = "  tests: npm test\n  lint: npm run lint";

/**
 * Condition 2: the `verification` section of `config.yaml` names at least one
 * check. An empty section is what `lexforge evidence record` already refuses
 * with exit code `2`; this check answers the same question before that call.
 */
export function checkVerification(verification: Record<string, string>): HealthCheck {
  const findings: DoctorFinding[] = [];

  if (Object.keys(verification).length === 0) {
    findings.push({
      rule: "verification-empty",
      level: "error",
      message:
        "config.yaml has no verification checks. Add at least one labelled command, for example:\n" +
        `${VERIFICATION_EXAMPLE}`,
    });
  }

  return { id: "verification", title: "Verification labels", findings };
}

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

function reinstallStep(tool: string): string {
  return `lexforge init --tools ${tool}`;
}

/**
 * Condition 3: every installed skill directory this package could have
 * written — for every known tool, in the project and in the home directory —
 * matches the shipped skill byte for byte, and its manifest names the current
 * package version.
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

      if (!existsSync(skillsDir)) {
        continue;
      }
      foundAny = true;

      const manifestFile = manifestPath(skillsDir);
      const manifest = existsSync(manifestFile)
        ? readManifest(readFileSync(manifestFile, "utf8"))
        : undefined;

      if (!manifest) {
        findings.push({
          rule: "skills-unmanaged",
          level: "error",
          message:
            `${skillsDir} holds skills for ${tool} (${scope}) with no lexforge install ` +
            `manifest, so its contents are unknown. Run "${reinstallStep(tool)}" to record it.`,
          path: skillsDir,
        });
        continue;
      }

      if (manifest.version !== version) {
        findings.push({
          rule: "skills-version-mismatch",
          level: "error",
          message:
            `${skillsDir} was installed by lexforge ${manifest.version}, this is ${version}. ` +
            `Run "${reinstallStep(tool)}" to update it.`,
          path: skillsDir,
        });
      }

      for (const file of manifest.files) {
        const installed = path.join(skillsDir, ...file.split("/"));
        const shipped = path.join(source, ...file.split("/"));

        if (!existsSync(installed)) {
          findings.push({
            rule: "skills-file-missing",
            level: "error",
            message:
              `${installed} is listed in the install manifest but missing on disk. ` +
              `Run "${reinstallStep(tool)}" to reinstall it.`,
            path: installed,
          });
          continue;
        }

        if (!existsSync(shipped)) {
          continue;
        }

        if (readFileSync(installed, "utf8") !== readFileSync(shipped, "utf8")) {
          findings.push({
            rule: "skills-modified",
            level: "error",
            message:
              `${installed} differs from the shipped skill. ` +
              `Run "${reinstallStep(tool)}" to reinstall it.`,
            path: installed,
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
 * Looks for a file named `name` in the directories of `pathValue`, a
 * `PATH`-shaped, `path.delimiter`-separated list, in order, and returns the
 * first one found. No process is started: the search reads the directories
 * directly, the same thing a shell does before it runs anything.
 */
export function resolveOnPath(name: string, pathValue: string): string | undefined {
  for (const directory of pathValue.split(path.delimiter)) {
    if (!directory) {
      continue;
    }
    const candidate = path.join(directory, name);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export interface CheckPathOptions {
  /** The bare name skills call the command by. Defaults to `lexforge`. */
  name?: string;
  /** The `PATH` environment value the search runs against. */
  pathValue: string;
  /** The file this run was started from. */
  runningFile: string;
}

/**
 * Condition 4: the bare name skills call the command by resolves on `PATH`,
 * and resolves to the file this run was started from. Skills invoke `lexforge`
 * by its bare name, so a name that does not resolve stops the queue rule on
 * its very first call.
 */
export function checkPath(options: CheckPathOptions): HealthCheck {
  const name = options.name ?? "lexforge";
  const findings: DoctorFinding[] = [];
  const resolved = resolveOnPath(name, options.pathValue);

  if (!resolved) {
    findings.push({
      rule: "path-not-resolved",
      level: "error",
      message:
        `"${name}" does not resolve on PATH. Skills call the command by its bare name, ` +
        "and without it the queue rule stops on the first call. " +
        `Install it globally ("npm install -g lexforge") or run it through npx ("npx lexforge").`,
    });
    return { id: "path", title: "Command name on PATH", findings };
  }

  if (path.resolve(resolved) !== path.resolve(options.runningFile)) {
    findings.push({
      rule: "path-multiple-installs",
      level: "error",
      message:
        `"${name}" on PATH resolves to ${resolved}, but this run is ${options.runningFile}. ` +
        "Two installations answer the same question differently.",
      path: resolved,
    });
  }

  return { id: "path", title: "Command name on PATH", findings };
}

/**
 * Condition 5: the project sits inside a git repository, and the repository
 * has a commit. Built on `tryGit`, whose non-zero exit code is returned
 * rather than thrown, so the absence of a repository is a finding here, not
 * the refusal `assertRepository` gives every other command.
 */
export function checkRepository(root: string): HealthCheck {
  const findings: DoctorFinding[] = [];

  if (!tryGit(root, ["rev-parse", "--show-toplevel"]).ok) {
    findings.push({
      rule: "repository-missing",
      level: "error",
      message: `${root} is not inside a git repository. Run "git init" to create one.`,
    });
    return { id: "repository", title: "Git repository", findings };
  }

  if (!tryGit(root, ["rev-parse", "--verify", "HEAD"]).ok) {
    findings.push({
      rule: "repository-no-commit",
      level: "error",
      message: `The repository at ${root} has no commits yet. Run "git commit" to create one.`,
    });
  }

  return { id: "repository", title: "Git repository", findings };
}

/** Reads the three numbers of a version. A part that is not a number reads as zero. */
function versionParts(version: string): [number, number, number] {
  const numbers = version.split(".");
  return [0, 1, 2].map((index) => {
    const value = Number.parseInt(numbers[index] ?? "", 10);
    return Number.isNaN(value) ? 0 : value;
  }) as [number, number, number];
}

/** Compares two versions number by number: -1 if left is older, 1 if newer, 0 if equal. */
function compareVersions(left: string, right: string): number {
  const a = versionParts(left);
  const b = versionParts(right);

  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) {
      return a[index]! < b[index]! ? -1 : 1;
    }
  }

  return 0;
}

export interface CheckRuntimeOptions {
  /** The running Node version, without the leading `v` — `process.versions.node`. */
  current: string;
  /** The `engines.node` field of `package.json`, such as `>=20.19.0`. */
  required?: string;
}

/**
 * Condition 6: the running Node version satisfies the `engines.node` field of
 * `package.json`. The comparison is written twice on purpose: once here, in
 * `src/core/`, and once in plain JavaScript in `bin/runtime-check.js`, which
 * runs before the build is loaded and cannot import this module.
 */
export function checkRuntime(options: CheckRuntimeOptions): HealthCheck {
  const required = options.required ?? requiredNodeVersion();
  const minimum = required.replace(/^[^0-9]*/, "");
  const findings: DoctorFinding[] = [];

  if (compareVersions(options.current, minimum) < 0) {
    findings.push({
      rule: "runtime-outdated",
      level: "error",
      message:
        `lexforge needs Node ${minimum} or newer, this is Node ${options.current}. ` +
        "Install a newer Node and run the command again.",
    });
  }

  return { id: "runtime", title: "Node version", findings };
}
