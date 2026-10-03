import { sourceDigest } from "./migration-state.js";
import { planAnalysis } from "./migration-analysis-plan.js";
import {
  reconciliations,
  reconciliationApproved,
  reconciliationCurrent,
} from "./reconciliation.js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { readHead } from "../git/repository.js";
import { worktreeDigest } from "../git/worktree-digest.js";
import { digest, hashFile, local } from "./files.js";
import {
  evaluateLegacyEvidence,
  readLegacyEvidence,
  type EvidenceIssue,
} from "./migration-analysis-evidence.js";
import { changeDir, executionPlan, taskSource, workflow } from "./plan.js";

export type MigrationClassification =
  "historically-confirmed" | "needs-verification" | "incomplete" | "conflict";

export interface RawCycle {
  id: string;
  tasks: string[];
  dependsOn?: string[];
  files?: { path: string }[];
  inputs?: string[];
  command?: string;
  design?: { path: string; heading: string }[];
  acceptance?: { id: string; task: string }[];
}

export interface MigrationFinding {
  code: string;
  reason: string;
  minimumAction: string;
  source: string;
  task?: string;
  cycle?: string;
}

export interface MigrationTaskDecision {
  id: string;
  source: { path: string; line: number; hash: string };
  text: string;
  checkbox: "checked" | "open";
  classification: MigrationClassification;
  origin: "historical" | "reconciled" | null;
  cycle: string | null;
  acceptance: string[];
  dependencies: string[];
  evidence: { source: string; hash: string; exitCode: number | null }[];
  gaps: EvidenceIssue[];
  conflicts: EvidenceIssue[];
  resolvedConflicts?: EvidenceIssue[];
}

export interface MigrationAnalysis {
  version: 1;
  change: string;
  sourceWorkflow: 1 | 2;
  targetWorkflow: 2;
  inputDigest: string;
  codeState: { head: string; worktreeDigest: string };
  sourceHashes: { kind: string; path: string; hash: string }[];
  tasks: MigrationTaskDecision[];
  findings: MigrationFinding[];
  plannedWrites: string[];
}

function readObject(file: string): Record<string, any> | undefined {
  if (!existsSync(file)) return;
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    return value && typeof value === "object" ? value : undefined;
  } catch {
    return;
  }
}

function rawCycles(root: string, change: string): RawCycle[] {
  const value = readObject(
    local(root, `${changeDir(change)}/execution-plan.json`),
  );
  if (!Array.isArray(value?.cycles)) return [];
  return value.cycles.filter(
    (cycle: any) =>
      cycle &&
      typeof cycle.id === "string" &&
      Array.isArray(cycle.tasks) &&
      cycle.tasks.every((task: unknown) => typeof task === "string"),
  );
}

export function relative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

export function issue(
  code: string,
  reason: string,
  minimumAction: string,
  source: string,
  fields: { task?: string; cycle?: string } = {},
): MigrationFinding {
  return { code, reason, minimumAction, source, ...fields };
}

function requirementPath(
  root: string,
  change: string,
  capability: string,
): string {
  const delta = `${changeDir(change)}/specs/${capability}/spec.md`;
  return existsSync(local(root, delta))
    ? delta
    : `lexforge/specs/${capability}/spec.md`;
}

export function analyzeMigration(
  root: string,
  change: string,
): MigrationAnalysis {
  const sourceWorkflow = workflow(root, change).version as 1 | 2;
  const source = taskSource(root, change);
  const cycles = rawCycles(root, change);
  const plan = planAnalysis(root, change, source, cycles);
  const legacy = readLegacyEvidence(root, change);
  const state = { head: readHead(root), worktreeDigest: worktreeDigest(root) };
  const tasks = source.tasks
    .map((task): MigrationTaskDecision => {
      const mapped = cycles.filter((cycle) =>
        cycle.tasks.includes(task.number),
      );
      const cycle = mapped.length === 1 ? mapped[0] : undefined;
      const acceptance = (cycle?.acceptance ?? [])
        .filter((item) => item.task === task.number)
        .map((item) => item.id)
        .sort();
      const evidence = evaluateLegacyEvidence({
        root,
        change,
        task: task.number,
        command: cycle?.command,
        acceptance,
        state,
        legacy,
      });
      const mappingConflict = plan.findings.some(
        (finding) =>
          finding.task === task.number ||
          (!!cycle && finding.cycle === cycle.id),
      );
      let classification: MigrationClassification;
      if (mappingConflict || evidence.conflicts.length)
        classification = "conflict";
      else if (!task.done)
        classification = evidence.evidence.length ? "conflict" : "incomplete";
      else if (evidence.confirmed) classification = "historically-confirmed";
      else classification = "needs-verification";
      const sourcePath = relative(root, task.file);
      return {
        id: task.number,
        source: {
          path: sourcePath,
          line: task.line,
          hash: hashFile(root, sourcePath),
        },
        text: task.text,
        checkbox: task.done ? "checked" : "open",
        classification,
        origin:
          classification === "historically-confirmed" ? "historical" : null,
        cycle: cycle?.id ?? null,
        acceptance,
        dependencies: [
          ...new Set([
            ...(cycle?.dependsOn ?? []),
            ...(plan.required.get(task.number) ?? []),
          ]),
        ].sort(),
        evidence: evidence.evidence,
        gaps: evidence.gaps,
        conflicts: evidence.conflicts,
      };
    })
    .sort((left, right) =>
      left.id.localeCompare(right.id, undefined, { numeric: true }),
    );
  const sources = new Map<string, { kind: string; path: string }>();
  const add = (kind: string, file: string) =>
    sources.set(`${kind}\0${file}`, { kind, path: file });
  source.tasks.forEach((task) => {
    add("task-source", relative(root, task.file));
    task.links.forEach((link) =>
      add("requirement", requirementPath(root, change, link.capability)),
    );
  });
  source.sections.forEach((section) =>
    add("task-index", relative(root, section.headingFile)),
  );
  add("project-config", "lexforge/config.yaml");
  add("cycle-map", `${changeDir(change)}/execution-plan.json`);
  add("change-config", `${changeDir(change)}/.lexforge.yaml`);
  add("legacy-evidence", `${changeDir(change)}/evidence.json`);
  add("legacy-red", `${changeDir(change)}/red-runs.json`);
  add("migration-state", `${changeDir(change)}/migration.json`);
  add("workflow-pin", `${changeDir(change)}/workflow.json`);
  add("defect-state", "lexforge/defects.json");
  cycles.forEach((cycle) => {
    (cycle.files ?? []).forEach((file) => add("code", file.path));
    (cycle.inputs ?? []).forEach((file) => add("input", file));
    (cycle.design ?? []).forEach((item) => add("design", item.path));
  });
  legacy.sources.forEach((file) => add("evidence-source", file));
  if (existsSync(local(root, `${changeDir(change)}/reconciliation`))) {
    for (const c of executionPlan(root, change, true)) {
      for (const { source: recordPath, record } of reconciliations(
        root,
        change,
        c,
      )) {
        add("reconciliation", recordPath);
        add("reconciliation", record.log);
        if (record.review) add("reconciliation", record.review.source);
        Object.keys(record.snapshotHashes).forEach((file) =>
          add("reconciliation", `${record.snapshot}/${file}`),
        );
        if (
          !reconciliationApproved(record) ||
          !reconciliationCurrent(root, change, c, record)
        )
          continue;
        for (const task of tasks.filter(
          (t) =>
            record.tasks.includes(t.id) &&
            t.checkbox === "checked" &&
            !plan.findings.some((f) => f.task === t.id || f.cycle === c.id),
        )) {
          if (task.conflicts.length) task.resolvedConflicts = task.conflicts;
          task.conflicts = [];
          task.classification = "historically-confirmed";
          task.origin = "reconciled";
          task.gaps = [];
          task.evidence.push({
            source: recordPath,
            hash: hashFile(root, recordPath),
            exitCode: 0,
          });
        }
      }
    }
  }
  const sourceHashes = [...sources.values()]
    .map((item) => ({ ...item, hash: hashFile(root, item.path) }))
    .sort((left, right) =>
      `${left.kind}\0${left.path}`.localeCompare(
        `${right.kind}\0${right.path}`,
      ),
    );
  return {
    version: 1,
    change,
    sourceWorkflow,
    targetWorkflow: 2,
    inputDigest: sourceDigest(
      sourceHashes.filter(
        (s) => !["migration-state", "workflow-pin"].includes(s.kind),
      ),
      state,
    ),
    codeState: state,
    sourceHashes,
    tasks,
    findings: plan.findings,
    plannedWrites: [
      `${changeDir(change)}/migration.json`,
      `${changeDir(change)}/workflow.json`,
    ],
  };
}
