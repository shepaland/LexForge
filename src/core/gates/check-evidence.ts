import path from "node:path";

import { UsageError } from "../../cli/errors.js";
import { answerPath, workspacePath } from "../answer-path.js";
import { assertRepository, readHead } from "../git/repository.js";
import { worktreeDigest } from "../git/worktree-digest.js";
import type { CommandResult } from "../types.js";
import type { Finding } from "../validation/finding.js";
import { readChangeConfig } from "../workspace/change-config.js";
import { findWorkspaceRoot } from "../workspace/find-root.js";
import { readProjectConfig, type ProjectConfig } from "../workspace/project-config.js";
import { evidenceFile, readLedger } from "./evidence-store.js";
import { freshnessFinding, labelState, type CodeState, type LabelState } from "./freshness.js";
import { describedLabels, labelUnknown, verificationEmpty } from "./verification-labels.js";

export interface CheckEvidenceOptions {
  /** Any directory inside the project; the workspace root is looked up from it. */
  cwd: string;
  change: string;
  /** Value of `--require` as it was written: labels separated by commas. */
  require?: string;
}

/** One checked label, whether it is fresh or not. */
export interface LabelReport {
  label: string;
  state: LabelState;
  /** The command of the label, from the `verification` section. */
  command: string;
  /** Commit the stamp was taken on, absent when there is no stamp. */
  head: string | null;
  /** Start of the run behind the stamp, absent when there is no stamp. */
  recordedAt: string | null;
}

export interface CheckEvidenceSummary {
  checked: number;
  fresh: number;
}

export interface CheckEvidenceData {
  outputVersion: 1;
  workspaceRoot: string;
  change: string;
  findings: Finding[];
  /** Every checked label, the fresh ones included. */
  labels: LabelReport[];
  summary: CheckEvidenceSummary;
  nextStep: string;
}

/**
 * Reads the ledger and tells, label by label, whether the stamp still stands
 * for the code on disk. No check is run here: a gate that runs the tests would
 * take minutes, and a command that slow gets left out of the loop it guards.
 */
export function checkEvidence(options: CheckEvidenceOptions): CommandResult<CheckEvidenceData> {
  const root = findWorkspaceRoot(options.cwd);
  readChangeConfig(root, options.change);
  const config = readProjectConfig(root);

  const labels = labelsToCheck(config, options.require);

  assertRepository(root);
  const current: CodeState = { head: readHead(root), worktreeDigest: worktreeDigest(root) };
  const ledger = readLedger(root, options.change);
  const file = relativeEvidenceFile(root, options.change);

  const reports: LabelReport[] = [];
  const findings: Finding[] = [];

  for (const label of labels) {
    const record = ledger.records[label];
    const state = labelState(record, current);

    reports.push({
      label,
      state,
      command: config.verification[label]!,
      head: record?.head ?? null,
      recordedAt: record?.startedAt ?? null,
    });

    const finding = freshnessFinding({
      file,
      change: options.change,
      label,
      state,
      record,
      current,
    });
    if (finding) {
      findings.push(finding);
    }
  }

  const nextStep =
    findings.length === 0
      ? `lexforge verify --change ${options.change}`
      : `record a stamp for each label above, then run: lexforge check evidence --change ${options.change}`;

  const data: CheckEvidenceData = {
    outputVersion: 1,
    workspaceRoot: answerPath(root),
    change: options.change,
    findings,
    labels: reports,
    summary: {
      checked: reports.length,
      fresh: reports.filter((report) => report.state === "fresh").length,
    },
    nextStep,
  };

  return {
    data,
    lines: renderLines(data),
    nextStep,
    exitCode: findings.length > 0 ? 1 : 0,
  };
}

/**
 * The labels this call checks: the ones `--require` names, or every label the
 * project describes when the flag is absent. Checking everything by default is
 * what makes the command usable without arguments at the end of the work.
 */
function labelsToCheck(config: ProjectConfig, required: string | undefined): string[] {
  const described = describedLabels(config);

  if (required === undefined) {
    // Nothing to check is not a pass: exit code 0 here would read as "the
    // checks went through" to a skill that never sees the empty section.
    if (described.length === 0) {
      throw verificationEmpty("verification-empty");
    }

    return described;
  }

  const named = [
    ...new Set(
      required
        .split(",")
        .map((label) => label.trim())
        .filter((label) => label !== ""),
    ),
  ].sort();

  if (named.length === 0) {
    throw new UsageError(
      "require-empty",
      `--require names no label, so there is nothing to check. This project describes: ` +
        `${described.join(", ")}.`,
      described.length > 0
        ? `lexforge check evidence --require ${described.join(",")}`
        : "describe the checks of this project first",
    );
  }

  // A label the project does not describe can never become fresh: there is no
  // command to stamp it with. Exit code 1 would send the agent to fix the plan
  // instead of the configuration.
  for (const label of named) {
    if (!described.includes(label)) {
      throw labelUnknown(config, label);
    }
  }

  return named;
}

/** The ledger path as a finding shows it: relative to the root, forward slashes. */
function relativeEvidenceFile(root: string, change: string): string {
  return workspacePath(root, evidenceFile(root, change));
}

/** One line per label: the label, its state, and the command behind it. */
function renderLines(data: CheckEvidenceData): string[] {
  const width = Math.max(...data.labels.map((report) => report.label.length));

  const lines = [`Evidence of change "${data.change}":`];
  for (const report of data.labels) {
    lines.push(`  ${report.label.padEnd(width)}  ${report.state}  ${report.command}`);
  }

  return lines;
}
