import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { UsageError } from "../../cli/errors.js";
import { answerPath } from "../answer-path.js";
import { resolveOnPath, type ResolveOnPathOptions } from "../command-on-path.js";
import { tryGit } from "../git/repository.js";
import { manifestPath, readManifest } from "../init/install-manifest.js";
import { builtinSkillsDir, isBuiltinSkillName } from "../init/plan-install.js";
import type { InstallScope } from "../init/tool-registry.js";
import { knownTools, toolDirectory } from "../init/tool-registry.js";
import { packageVersion, requiredNodeVersion } from "../package-info.js";
import { findWorkspaceRoot } from "../workspace/find-root.js";
import { readProjectConfig } from "../workspace/project-config.js";
import { workspacePaths } from "../workspace/paths.js";

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

/**
 * Turns the `UsageError` a workspace lookup throws into a finding. The path
 * comes from `filePath` when the caller already knows it — `config.yaml`
 * once its directory has been found — and otherwise from the error itself
 * (`workspace-incomplete` names its own known file). `workspace-not-found`
 * sets neither: its search crossed the whole directory tree, so there is no
 * single path to name.
 */
function workspaceFinding(error: UsageError, filePath?: string): DoctorFinding {
  const nextStep = error.nextStep ? ` Run: ${error.nextStep}` : "";
  const finding: DoctorFinding = {
    rule: error.code,
    level: "error",
    message: `${error.message}${nextStep}`,
  };
  const foundPath = filePath ?? error.path;
  if (foundPath) {
    finding.path = answerPath(foundPath);
  }
  return finding;
}

/**
 * Condition 1: the `lexforge/` workspace is set up and `config.yaml` reads
 * without error. `findWorkspaceRoot` and `readProjectConfig` both throw a
 * `UsageError` for every other command; here that state is a finding, not a
 * refusal to run. `readProjectConfig` also lets a `YAMLParseError` from the
 * `yaml` package through unchanged on syntactically broken YAML — that is
 * caught here too, not just `UsageError`, so a hand-edited `config.yaml` gives
 * a finding rather than crashing this otherwise pure function.
 */
export function checkWorkspace(cwd: string): HealthCheck {
  const findings: DoctorFinding[] = [];
  let root: string;

  try {
    root = findWorkspaceRoot(cwd);
  } catch (error) {
    if (error instanceof UsageError) {
      findings.push(workspaceFinding(error));
      return { id: "workspace", title: "Workspace and configuration", findings };
    }
    throw error;
  }

  const configPath = workspacePaths(root).config;

  try {
    readProjectConfig(root);
  } catch (error) {
    if (error instanceof UsageError) {
      findings.push(workspaceFinding(error, configPath));
    } else if (error instanceof Error) {
      findings.push({
        rule: "config-unreadable",
        level: "error",
        message: `config.yaml could not be read: ${error.message}`,
        path: answerPath(configPath),
      });
    } else {
      throw error;
    }
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
function sameInstallation(resolved: string, runningFile: string, windows: boolean): boolean {
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

export interface CheckPathOptions extends ResolveOnPathOptions {
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
  const resolved = resolveOnPath(name, options.pathValue, {
    platform: options.platform,
    pathExt: options.pathExt,
  });

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

  const windows = (options.platform ?? process.platform) === "win32";

  if (!sameInstallation(resolved, options.runningFile, windows)) {
    findings.push({
      rule: "path-multiple-installs",
      level: "error",
      message:
        `"${name}" on PATH resolves to ${answerPath(resolved)}, but this run is ` +
        `${answerPath(options.runningFile)}. ` +
        "Two installations answer the same question differently.",
      path: answerPath(resolved),
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
