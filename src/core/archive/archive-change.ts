import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { UsageError } from "../../cli/errors.js";
import { capabilityOf, listSpecFiles } from "../gates/coverage-rules.js";
import { verifyChange } from "../gates/verify-change.js";
import { describedLabels, verificationEmpty } from "../gates/verification-labels.js";
import { assertRepository } from "../git/repository.js";
import { loadSchema } from "../schemas/load-schema.js";
import { parseOutputTarget } from "../schemas/output-target.js";
import { readChangeState } from "../status/change-status.js";
import type { ChangeState } from "../artifact-graph/graph.js";
import type { CommandResult } from "../types.js";
import type { Finding } from "../validation/finding.js";
import { readChangeConfig } from "../workspace/change-config.js";
import { findWorkspaceRoot } from "../workspace/find-root.js";
import { workspacePaths } from "../workspace/paths.js";
import { readProjectConfig } from "../workspace/project-config.js";
import { applyChange, type CapabilityMerge, type MergedSpec } from "./apply-plan.js";

export interface ArchiveChangeOptions {
  /** Any directory inside the project; the workspace root is looked up from it. */
  cwd: string;
  change: string;
  /**
   * Local time the archiving is named after. A parameter rather than a call to
   * the clock inside: the directory name is part of the result, and a result
   * that changes with the day cannot be checked.
   */
  now?: Date;
}

export interface ArchiveChangeSummary {
  openTasks: number;
  requirementsWithoutTrace: number;
  staleLabels: number;
  /**
   * Conflicts of the merge. It stands apart from the three measures because it
   * says where the work goes: a conflict is fixed in the delta of the change,
   * a finding of a measure in the code or in the plan.
   */
  conflicts: number;
  /** Main specs this run wrote. Zero when the merge changed nothing. */
  specsWritten: number;
}

export interface ArchiveChangeData {
  outputVersion: 1;
  workspaceRoot: string;
  change: string;
  findings: Finding[];
  summary: ArchiveChangeSummary;
  /** Where the change now lives, empty when it was not moved. */
  archivePath: string;
  nextStep: string;
}

/**
 * Merges the delta of a change into the main specs and moves the change into
 * the archive. The checks are counted again here rather than read off a stored
 * verdict: a verdict written yesterday says nothing about the code on disk.
 */
export function archiveChange(options: ArchiveChangeOptions): CommandResult<ArchiveChangeData> {
  const root = findWorkspaceRoot(options.cwd);
  const config = readProjectConfig(root);

  // A project that describes no checks has nothing to confirm the work with,
  // and exit code 0 here would read as "the checks passed".
  if (describedLabels(config).length === 0) {
    throw verificationEmpty("verification-empty");
  }

  const { state } = readChangeState(root, options.change);
  assertPlanningComplete(options.change, state);

  const target = archiveTarget(root, options.change, options.now ?? new Date());
  assertArchiveFree(root, target);

  // The delta is read before anything is measured: a change whose declaration
  // and whose files disagree is refused, not merged one way or the other.
  const merges = readMerges(root, options.change, state);

  assertRepository(root);

  const checks = verifyChange({ cwd: root, change: options.change }).data.findings;

  // The merge is counted whole before a single file is written, and a check
  // that failed stops the command before the merge is even attempted.
  const merge = checks.length > 0 ? null : applyChange(merges);
  const findings = [...checks, ...(merge?.conflicts ?? [])];

  let archivePath = "";
  let written: string[] = [];
  if (findings.length === 0 && merge) {
    // The specs are written first: they are rebuilt by running the command
    // again, while a directory moved ahead of them would have to be found by
    // hand.
    written = writeSpecs(root, merge.specs);
    archivePath = moveToArchive(root, options.change, target);
  }

  const nextStep =
    findings.length > 0
      ? `fix the findings above, then run: lexforge archive ${options.change}`
      : "ask the user how to finish the branch: merge it into the base branch, " +
        "open a pull request, or leave it as it is";

  const data: ArchiveChangeData = {
    outputVersion: 1,
    workspaceRoot: root,
    change: options.change,
    findings,
    summary: summarise(checks, merge?.conflicts.length ?? 0, written.length),
    archivePath,
    nextStep,
  };

  return {
    data,
    lines: renderLines(data, written),
    nextStep,
    exitCode: findings.length > 0 ? 1 : 0,
  };
}

/**
 * Archiving comes after planning, not instead of it. An artifact that is
 * neither written nor declared skipped means the change was never planned to
 * the end, and merging its delta would carry half a decision into the specs.
 */
function assertPlanningComplete(change: string, state: ChangeState): void {
  if (state.isPlanningComplete) {
    return;
  }

  const open = state.artifacts.find(
    (artifact) => artifact.status !== "done" && artifact.status !== "skipped",
  )!;

  throw new UsageError(
    "artifact-missing",
    `change "${change}" is not planned to the end: artifact "${open.id}" is ` +
      "neither written nor skipped. Every artifact of the schema is written or " +
      "declared skipped before the change is archived.",
    `lexforge instructions ${open.id} --change ${change}`,
  );
}

/**
 * The delta specs of the change, each paired with the main spec it merges into.
 * A change that declares its delta skipped merges nothing: there is no
 * requirement to carry over.
 */
function readMerges(root: string, change: string, state: ChangeState): CapabilityMerge[] {
  const paths = workspacePaths(root);
  const schema = loadSchema(readChangeConfig(root, change).schema);
  const changeDir = paths.changeDir(change);

  for (const definition of schema.artifacts) {
    const target = parseOutputTarget(definition.generates);
    if (target.kind !== "glob") {
      continue;
    }

    const specsDir = path.join(changeDir, target.dir);
    const files = listSpecFiles(specsDir, `.${target.extension}`);

    if (state.artifacts.find((artifact) => artifact.id === definition.id)?.status === "skipped") {
      if (files.length > 0) {
        throw new UsageError(
          "change-config-mismatch",
          `change "${change}" declares skip_${definition.id}: true, and its ` +
            `directory holds ${files.length} delta spec ` +
            `${files.length === 1 ? "file" : "files"} under ${target.dir}/. ` +
            "The declaration and the files say different things, and which of " +
            "the two counts is not for this command to guess.",
          `either remove skip_${definition.id} from the change configuration, or ` +
            `remove the files under ${target.dir}/, then run this command again`,
        );
      }

      return [];
    }

    return files.map((file) => {
      const relative = path.relative(specsDir, file).split(path.sep).join("/");
      const capability = capabilityOf(relative);
      const specFile = path.join(paths.specs, capability, "spec.md");

      return {
        capability,
        deltaFile: workspacePath(root, file),
        delta: readFileSync(file, "utf8"),
        specFile: workspacePath(root, specFile),
        spec: existsSync(specFile) ? readFileSync(specFile, "utf8") : null,
      };
    });
  }

  return [];
}

/**
 * Writes the merged specs. Each file goes into a temporary file next to the
 * target and is renamed over it, so an interrupted write leaves the spec that
 * stood there rather than half of the new one.
 */
function writeSpecs(root: string, specs: MergedSpec[]): string[] {
  const written: string[] = [];

  for (const spec of specs) {
    if (!spec.changed) {
      continue;
    }

    const file = path.join(root, spec.file);
    mkdirSync(path.dirname(file), { recursive: true });

    const temporary = `${file}.tmp`;
    writeFileSync(temporary, spec.content, "utf8");
    renameSync(temporary, file);
    written.push(spec.file);
  }

  return written;
}

/**
 * Moves the change directory under the archive, named by the local date of the
 * archiving. The date takes the sorting on itself: the archive reads in order
 * of time without asking the version control anything.
 *
 * The whole directory moves as it stands, `evidence.json` with it. The ledger
 * is the only record left of what was run and on which state of the code.
 */
function moveToArchive(root: string, change: string, target: string): string {
  const paths = workspacePaths(root);

  mkdirSync(paths.archive, { recursive: true });
  renameSync(paths.changeDir(change), target);

  return workspacePath(root, target);
}

/** Where this change goes: the archive, the local date, the name of the change. */
function archiveTarget(root: string, change: string, now: Date): string {
  return path.join(workspacePaths(root).archive, `${localDate(now)}-${change}`);
}

/**
 * A directory already standing under that name is what an archiving that broke
 * off halfway leaves behind, and only a person can tell which of the two copies
 * of the change is the one to keep. The check runs before anything is written,
 * so a refusal here leaves the workspace as it was.
 */
function assertArchiveFree(root: string, target: string): void {
  if (!existsSync(target)) {
    return;
  }

  const shown = workspacePath(root, target);

  throw new UsageError(
    "archive-path-taken",
    `${shown} already exists. A change is archived under that name once, and ` +
      "what stands there now is left for a person to read.",
    `read ${shown}, move or remove it by hand, then run this command again`,
  );
}

/** The local date as `YYYY-MM-DD`. */
function localDate(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * The path a reader is shown: relative to the workspace root and written with
 * forward slashes, so the same file reads the same way on every machine.
 */
function workspacePath(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

/** Counters the skill reads to learn which measure it has to go back to. */
function summarise(
  checks: Finding[],
  conflicts: number,
  specsWritten: number,
): ArchiveChangeSummary {
  const count = (rule: string): number =>
    checks.filter((finding) => finding.rule === rule).length;

  return {
    openTasks: count("task-not-done"),
    requirementsWithoutTrace: count("requirement-without-trace"),
    staleLabels: count("evidence-not-fresh"),
    conflicts,
    specsWritten,
  };
}

/**
 * The findings under the file they were found in, or what the merge did when
 * there are none. A conflict is named as a conflict: it is fixed in the delta
 * of the change, and editing the main spec by hand to get past it writes a
 * requirement nobody wrote in a change.
 */
function renderLines(data: ArchiveChangeData, written: string[]): string[] {
  if (data.findings.length === 0) {
    return [
      `Change "${data.change}" is archived.`,
      ...written.map((file) => `  merged into ${file}`),
      `The change now lives in ${data.archivePath}.`,
    ];
  }

  const lines: string[] = [];
  let file = "";

  for (const finding of data.findings) {
    if (finding.file !== file) {
      file = finding.file;
      lines.push(file);
    }
    lines.push(`  ${finding.line}  ${finding.level}  ${finding.rule}  ${finding.message}`);
  }

  if (data.summary.conflicts > 0) {
    lines.push(
      "",
      "A conflict is fixed in the delta specs of the change. The main spec is " +
        "not edited by hand to get the merge through.",
    );
  }

  return lines;
}
