import path from "node:path";

import { UsageError } from "../../cli/errors.js";
import { answerPath, workspacePath } from "../answer-path.js";
import { assertRepository, readHead } from "../git/repository.js";
import { worktreeDigest } from "../git/worktree-digest.js";
import type { CommandResult, OutputStream } from "../types.js";
import { makeFinding, type Finding } from "../validation/finding.js";
import { readChangeConfig } from "../workspace/change-config.js";
import { findWorkspaceRoot } from "../workspace/find-root.js";
import { CONFIG_FILE, WORKSPACE_DIR } from "../workspace/paths.js";
import { readProjectConfig } from "../workspace/project-config.js";
import { evidenceFile, putRecord, readLedger, type EvidenceRecord } from "./evidence-store.js";
import { COMMAND_NOT_FOUND, NOT_EXECUTABLE, runLabelCommand } from "./run-command.js";
import { labelCommand } from "./verification-labels.js";

export interface RecordEvidenceOptions {
  /** Any directory inside the project; the workspace root is looked up from it. */
  cwd: string;
  change: string;
  /** Label of the check, as written in the `verification` section. */
  label: string;
  /** Where the output of the run is echoed while it runs. */
  stdout: OutputStream;
  stderr: OutputStream;
}

export interface EvidenceRecordSummary {
  /** Stamps this call wrote: one, always. */
  recorded: number;
  /** Of them, the ones whose run came back with a non-zero code. */
  failed: number;
}

export interface EvidenceRecordData {
  outputVersion: 1;
  workspaceRoot: string;
  change: string;
  label: string;
  /** The stamp as it was written to the ledger. */
  record: EvidenceRecord;
  findings: Finding[];
  summary: EvidenceRecordSummary;
  nextStep: string;
}

/**
 * Runs the command of one label and writes the stamp. The run is recorded
 * whatever it returns: a ledger that keeps only green runs shows a history
 * that never happened.
 */
export async function recordEvidence(
  options: RecordEvidenceOptions,
): Promise<CommandResult<EvidenceRecordData>> {
  const root = findWorkspaceRoot(options.cwd);
  readChangeConfig(root, options.change);
  const config = readProjectConfig(root);

  // The label is checked before anything is run: an undescribed label cannot
  // become a stamp, and the reader has to fix the configuration, not the code.
  const command = labelCommand(config, options.label);

  assertRepository(root);
  const head = readHead(root);
  // The ledger is read before the run: a broken file stops the command now
  // rather than after minutes of testing that nothing can be written down.
  readLedger(root, options.change);

  const run = await runLabelCommand({
    command,
    cwd: root,
    stdout: options.stdout,
    stderr: options.stderr,
  });

  // A run that never started is not a red run: there is nothing to record, and
  // a stamp saying "exit code 127" would read as a check that failed. The shell
  // reports both cases by number, and there is no other signal to read.
  if (run.exitCode === COMMAND_NOT_FOUND || run.exitCode === NOT_EXECUTABLE) {
    throw new UsageError(
      "evidence-command-failed",
      `check "${options.label}" runs "${command}", and the shell could not run it ` +
        `(exit code ${run.exitCode}). No stamp is written for a run that never started.`,
      `fix the command of "${options.label}" in ${WORKSPACE_DIR}/${CONFIG_FILE}, ` +
        `then run: lexforge evidence record --change ${options.change} --label ${options.label}`,
    );
  }

  // The digest is taken after the run, not before: a check may write files of
  // its own, and `check evidence` right after this has to see the same tree.
  const record: EvidenceRecord = {
    command,
    exitCode: run.exitCode,
    startedAt: run.startedAt,
    durationMs: run.durationMs,
    head,
    worktreeDigest: worktreeDigest(root),
    outputTail: run.outputTail,
    outputTruncated: run.outputTruncated,
  };

  putRecord(root, options.change, options.label, record);

  // A red run is a finding, not a refusal: the check ran, the stamp is written,
  // and the skill has to see the failure on this call rather than the next one.
  const failed = record.exitCode !== 0;
  const findings: Finding[] = failed
    ? [
        makeFinding(
          relativeEvidenceFile(root, options.change),
          1,
          "evidence-run-failed",
          `check "${options.label}" ran "${command}" and it finished with exit code ` +
            `${record.exitCode}. The stamp holds that code, so the check is not passed.`,
        ),
      ]
    : [];

  const nextStep = failed
    ? `fix what the run above reported, then run: lexforge evidence record --change ${options.change} --label ${options.label}`
    : `lexforge check evidence --change ${options.change}`;

  const data: EvidenceRecordData = {
    outputVersion: 1,
    workspaceRoot: answerPath(root),
    change: options.change,
    label: options.label,
    record,
    findings,
    // The same six fields every gate answers with, so a skill reads one shape
    // whichever gate it called.
    summary: { recorded: 1, failed: failed ? 1 : 0 },
    nextStep,
  };

  return {
    data,
    lines: [
      `Check "${options.label}" finished with exit code ${record.exitCode} ` +
        `in ${record.durationMs} ms.`,
    ],
    nextStep,
    exitCode: failed ? 1 : 0,
  };
}

/** The ledger path as a finding shows it: relative to the root, forward slashes. */
function relativeEvidenceFile(root: string, change: string): string {
  return workspacePath(root, evidenceFile(root, change));
}
