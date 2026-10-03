import { refuse } from "./files.js";
import {
  analyzeMigration,
  type MigrationClassification,
  type MigrationTaskDecision,
} from "./migration-analysis.js";

interface SummarySource {
  code: string;
  reason: string;
  minimumAction: string;
  task?: string;
  cycle?: string;
  sources: string[];
}

function summaries(
  items: SummarySource[],
  change: string,
  classification: "conflict" | "needs-verification",
) {
  const codes = [...new Set(items.map((item) => item.code))].sort();
  return codes.map((code) => {
    const matches = items.filter((item) => item.code === code);
    const first = matches[0]!;
    const examples = [
      ...new Set(
        matches.flatMap((item) => [item.task, item.cycle]).filter(Boolean),
      ),
    ].slice(0, 3);
    const sources = [...new Set(matches.flatMap((item) => item.sources))].slice(
      0,
      3,
    );
    const filter = `--class ${classification}`;
    return {
      code,
      count: matches.length,
      reason: first.reason,
      minimumAction: first.minimumAction,
      examples,
      sources,
      details:
        `lexforge workflow migrate --change ${change} --to 2 --dry-run ` +
        `${filter} --json`,
    };
  });
}

function issueSources(task: MigrationTaskDecision, source: string): string[] {
  void source;
  return [task.source.path];
}

export function migrationPreview(
  root: string,
  change: string,
  filter: { task?: string; classification?: string } = {},
) {
  const analysis = analyzeMigration(root, change);
  const classes: MigrationClassification[] = [
    "historically-confirmed",
    "needs-verification",
    "incomplete",
    "conflict",
  ];
  if (
    filter.classification &&
    !classes.includes(filter.classification as MigrationClassification)
  )
    refuse(`Unknown migration classification: ${filter.classification}`);
  const selected = filter.task
    ? analysis.tasks.filter((task) => task.id === filter.task)
    : filter.classification
      ? analysis.tasks.filter(
          (task) => task.classification === filter.classification,
        )
      : [];
  if (filter.task && selected.length === 0)
    refuse(`Unknown task: ${filter.task}`);
  const base = {
    outputVersion: 1,
    change,
    sourceWorkflow: analysis.sourceWorkflow,
    targetWorkflow: 2,
    mode: "dry-run",
    inputDigest: analysis.inputDigest,
    applied: false,
  };
  const selectedTasks = new Set(selected.map((task) => task.id));
  const selectedCycles = new Set(
    selected
      .map((task) => task.cycle)
      .filter((cycle): cycle is string => !!cycle),
  );
  const findings = analysis.findings
    .filter(
      (finding) =>
        (finding.task ? selectedTasks.has(finding.task) : false) ||
        (finding.cycle ? selectedCycles.has(finding.cycle) : false) ||
        (!!filter.classification && !finding.task && !finding.cycle),
    )
    .map((finding) => ({
      code: finding.code,
      reason: finding.reason,
      minimumAction: finding.minimumAction,
      ...(finding.task ? { task: finding.task } : {}),
      ...(finding.cycle ? { cycle: finding.cycle } : {}),
      sources: [finding.source],
    }));
  if (filter.task)
    return {
      ...base,
      task: selected[0],
      findings,
      nextStep:
        selected[0]!.conflicts[0]?.minimumAction ??
        selected[0]!.gaps[0]?.minimumAction ??
        "review the task decision",
    };
  if (filter.classification)
    return {
      ...base,
      classification: filter.classification,
      tasks: selected,
      findings,
      nextStep: "review the filtered task decisions",
    };
  const conflicts: SummarySource[] = [
    ...analysis.findings.map((finding) => ({
      ...finding,
      sources: [finding.source],
    })),
    ...analysis.tasks.flatMap((task) =>
      task.conflicts.map((conflict) => ({
        ...conflict,
        task: task.id,
        cycle: task.cycle ?? undefined,
        sources: issueSources(task, conflict.source),
      })),
    ),
  ];
  const gaps: SummarySource[] = analysis.tasks.flatMap((task) =>
    task.gaps.map((gap) => ({
      ...gap,
      task: task.id,
      cycle: task.cycle ?? undefined,
      sources: issueSources(task, gap.source),
    })),
  );
  const blockers = summaries(conflicts, change, "conflict");
  const gapSummaries = summaries(gaps, change, "needs-verification");
  const count = (classification: MigrationClassification) =>
    analysis.tasks.filter((task) => task.classification === classification)
      .length;
  const mixedCycles = new Set(
    analysis.tasks
      .filter((task) => task.cycle)
      .filter((task, _index, all) =>
        all.some(
          (other) =>
            other.cycle === task.cycle &&
            other.classification !== task.classification,
        ),
      )
      .map((task) => task.cycle),
  ).size;
  return {
    ...base,
    summary: {
      tasks: analysis.tasks.length,
      historicallyConfirmed: count("historically-confirmed"),
      needsVerification: count("needs-verification"),
      incomplete: count("incomplete"),
      conflicts: count("conflict"),
      cycles: new Set(analysis.tasks.map((task) => task.cycle).filter(Boolean))
        .size,
      mixedCycles,
      blockingFindings: blockers.reduce((sum, item) => sum + item.count, 0),
    },
    blockers,
    gaps: gapSummaries,
    plannedWrites: analysis.plannedWrites,
    stateTransitions: [
      "workflow 1 remains active during analysis",
      "migration ledger becomes durable",
      "workflow pin changes from 1 to 2 as the commit point",
    ],
    nextStep: blockers.length
      ? "resolve the blocking findings, then repeat this dry-run"
      : `review the preview, then run lexforge workflow migrate --change ${change} --to 2`,
  };
}
