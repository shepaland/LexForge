import { answerPath } from "../answer-path.js";
import { resolveOnPath, type ResolveOnPathOptions } from "../command-on-path.js";
import { tryGit } from "../git/repository.js";
import { requiredNodeVersion } from "../package-info.js";
import type { DoctorFinding, HealthCheck } from "./checks.js";
import { sameInstallation } from "./checks-skills.js";

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
