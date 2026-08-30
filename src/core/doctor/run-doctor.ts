import path from "node:path";

import { answerPath } from "../answer-path.js";
import { packageVersion } from "../package-info.js";
import type { CommandResult } from "../types.js";
import { findWorkspaceRoot } from "../workspace/find-root.js";
import { readProjectConfig } from "../workspace/project-config.js";
import {
  checkPath,
  checkRepository,
  checkRuntime,
  checkSkills,
  checkVerification,
  checkWorkspace,
  type DoctorFinding,
  type HealthCheck,
} from "./checks.js";

export interface RunDoctorOptions {
  /** Any directory inside the project; the workspace root is looked up from it. */
  cwd: string;
  /** The home directory the user-scope skill directories are read under. */
  home: string;
  /** The `PATH` value the command name is resolved against. */
  pathValue: string;
  /** The file this run was started from. */
  runningFile: string;
  /** The directory the shipped skills are compared against. Defaults to the built-in one. */
  skillsDir?: string;
  /** The package version findings and the top-level field compare against. */
  version?: string;
  /** The running Node version. Defaults to `process.versions.node`. */
  nodeVersion?: string;
}

export interface DoctorSummary {
  checksTotal: number;
  checksPassed: number;
  findingsTotal: number;
}

export interface DoctorData {
  outputVersion: 1;
  version: string;
  workspaceRoot: string;
  checks: HealthCheck[];
  findings: DoctorFinding[];
  summary: DoctorSummary;
  nextStep: string;
}

/**
 * What a run without findings names as the next step: the pipeline is entered
 * by asking an agent, not by another command of this program. README quotes
 * this line word for word, and a test holds the two together.
 */
export const HEALTHY_NEXT_STEP =
  "installation is healthy. Ask your agent to start work, for example: lexforge new change <name>";
const FINDINGS_NEXT_STEP = "fix the findings above, then run: lexforge doctor";

/**
 * Assembles the six checks of `checks.ts` into one answer. This function never
 * throws on a broken or missing installation: an absent workspace, skills,
 * repository or verification labels is a finding, not a refusal to run — the
 * command exists to answer exactly that question. It reads files but never
 * writes, deletes or runs anything a project describes.
 */
export function runDoctor(options: RunDoctorOptions): CommandResult<DoctorData> {
  const version = options.version ?? packageVersion();

  const workspace = checkWorkspace(options.cwd);

  // Root and readable configuration are two separate failures, and the second
  // must not roll back the first: a project with a workspace but a broken
  // `config.yaml` still has a real root, and `checkSkills`/`checkRepository`
  // below must see it, not `cwd`.
  let root: string;
  try {
    root = findWorkspaceRoot(options.cwd);
  } catch {
    root = path.resolve(options.cwd);
  }

  let verification: Record<string, string> = {};
  try {
    verification = readProjectConfig(root).verification;
  } catch {
    // Missing or unreadable config.yaml is already reported by `workspace`
    // above; `checkVerification` reports the empty section as its own finding.
  }

  const checks: HealthCheck[] = [
    workspace,
    checkVerification(verification),
    checkSkills({ root, home: options.home, skillsDir: options.skillsDir, version }),
    checkPath({ pathValue: options.pathValue, runningFile: options.runningFile }),
    checkRepository(root),
    checkRuntime({ current: options.nodeVersion ?? process.versions.node }),
  ];

  const findings = checks.flatMap((check) => check.findings);
  const nextStep = findings.length === 0 ? HEALTHY_NEXT_STEP : FINDINGS_NEXT_STEP;

  const data: DoctorData = {
    outputVersion: 1,
    version,
    workspaceRoot: answerPath(root),
    checks,
    findings,
    summary: {
      checksTotal: checks.length,
      checksPassed: checks.filter((check) => check.findings.length === 0).length,
      findingsTotal: findings.length,
    },
    nextStep,
  };

  return {
    data,
    lines: renderLines(checks),
    nextStep,
    exitCode: findings.length > 0 ? 1 : 0,
  };
}

/**
 * Every condition, pass or fail: a condition without a finding is named the
 * same as one with. `renderResult` appends the next step itself, from the
 * `nextStep` field returned alongside these lines.
 */
function renderLines(checks: HealthCheck[]): string[] {
  const lines: string[] = [];

  for (const check of checks) {
    if (check.findings.length === 0) {
      lines.push(`OK    ${check.title}`);
      continue;
    }

    lines.push(`FAIL  ${check.title}`);
    for (const finding of check.findings) {
      lines.push(`  ${finding.rule}: ${finding.message}`);
    }
  }

  return lines;
}
