import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { workspacePath } from "../answer-path.js";
import { nextStepForChange } from "../next-step.js";
import { readTextFile } from "../read-text.js";
import { loadSchema } from "../schemas/load-schema.js";
import { parseOutputTarget, type OutputTarget } from "../schemas/output-target.js";
import { readChangeState } from "../status/change-status.js";
import type { CommandResult } from "../types.js";
import { readChangeConfig } from "../workspace/change-config.js";
import { findWorkspaceRoot } from "../workspace/find-root.js";
import { CHANGE_CONFIG_FILE, workspacePaths } from "../workspace/paths.js";
import { makeFinding, type Finding } from "./finding.js";
import { scanSpec } from "./scan-spec.js";
import {
  checkArtifactsDone,
  checkPurpose,
  checkRenamedPairs,
  checkTemplatePlaceholders,
} from "./strict-rules.js";

export interface ValidateChangeOptions {
  /** Any directory inside the project; the workspace root is looked up from it. */
  cwd: string;
  change: string;
  /** Strict mode adds the completeness rules on top of the same scan. */
  strict?: boolean;
}

export interface ValidateSummary {
  errors: number;
  /** Every rule of this stage reports at the error level, so this stays at zero. */
  warnings: number;
}

export interface ValidateChangeData {
  outputVersion: 1;
  /** What was checked: the name of the change. */
  target: string;
  strict: boolean;
  findings: Finding[];
  summary: ValidateSummary;
  nextStep: string;
}

/**
 * Checks one change: every delta spec of the change goes through the scanner,
 * and the findings are collected into one list. The exit code counts findings,
 * not their levels: one finding fails the check.
 */
export function validateChange(
  options: ValidateChangeOptions,
): CommandResult<ValidateChangeData> {
  const root = findWorkspaceRoot(options.cwd);
  const strict = options.strict === true;

  const config = readChangeConfig(root, options.change);
  const schema = loadSchema(config.schema);
  const { state } = readChangeState(root, options.change);
  const paths = workspacePaths(root);
  const changeDir = paths.changeDir(options.change);

  const findings: Finding[] = [];

  for (const definition of schema.artifacts) {
    const target = parseOutputTarget(definition.generates);
    const status = state.artifacts.find((artifact) => artifact.id === definition.id)?.status;
    const isDelta = target.kind === "glob";

    let requirements = 0;
    for (const file of collectFiles(changeDir, target)) {
      const shown = workspacePath(root, file);
      const content = readTextFile(file);

      if (isDelta) {
        const scan = scanSpec(shown, content);
        requirements += scan.requirements.length;
        findings.push(...scan.findings);

        if (strict) {
          findings.push(...checkPurpose(shown, content));
          findings.push(...checkRenamedPairs(shown, content));
        }
      }

      if (strict && status === "done") {
        findings.push(...checkTemplatePlaceholders(shown, content));
      }
    }

    if (isDelta && requirements === 0 && status !== "skipped") {
      findings.push(
        makeFinding(
          workspacePath(root, paths.changeConfig(options.change)),
          1,
          "empty-delta",
          `Change "${options.change}" has no requirement in its delta specs. ` +
            `Write the requirements, or set skip_${definition.id}: true in ` +
            `${CHANGE_CONFIG_FILE} when the change alters no behaviour. ` +
            "Do not invent a requirement to make this check pass.",
        ),
      );
    }
  }

  if (strict) {
    findings.push(
      ...checkArtifactsDone(
        options.change,
        state.artifacts.map((artifact) => ({
          id: artifact.id,
          status: artifact.status,
          file: workspacePath(root, artifact.resolvedOutputPath),
        })),
      ),
    );
  }

  const command = `lexforge validate ${options.change}${strict ? " --strict" : ""}`;

  const data: ValidateChangeData = {
    outputVersion: 1,
    target: options.change,
    strict,
    findings,
    summary: { errors: findings.length, warnings: 0 },
    nextStep:
      findings.length === 0
        ? nextStepForChange(options.change, state)
        : `fix the findings above, then run: ${command}`,
  };

  return {
    data,
    lines: renderLines(data),
    nextStep: data.nextStep,
    exitCode: findings.length > 0 ? 1 : 0,
  };
}

/** Files the artifact has written: one path for a file, the whole set for a glob. */
function collectFiles(changeDir: string, target: OutputTarget): string[] {
  if (target.kind === "file") {
    const file = path.join(changeDir, target.path);
    return existsSync(file) && statSync(file).isFile() ? [file] : [];
  }

  return listFiles(path.join(changeDir, target.dir), `.${target.extension}`);
}

/** Every file with the given extension under the directory, in name order. */
function listFiles(dir: string, extension: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...listFiles(full, extension));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(full);
    }
  }

  return files;
}

/**
 * Findings grouped by file: the path stands on its own line, every finding of
 * that file goes under it as `<line>  <level>  <rule>  <text>`.
 */
function renderLines(data: ValidateChangeData): string[] {
  if (data.findings.length === 0) {
    return [`Change "${data.target}" has no findings.`];
  }

  const byFile = new Map<string, Finding[]>();
  for (const finding of data.findings) {
    const group = byFile.get(finding.file);
    if (group) {
      group.push(finding);
    } else {
      byFile.set(finding.file, [finding]);
    }
  }

  const lines: string[] = [];
  for (const [file, group] of byFile) {
    lines.push(file);
    for (const finding of group) {
      lines.push(`  ${finding.line}  ${finding.level}  ${finding.rule}  ${finding.message}`);
    }
  }

  return lines;
}
