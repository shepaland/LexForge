import { UsageError } from "../../cli/errors.js";
import { answerPath } from "../answer-path.js";
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
