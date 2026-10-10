import { migrationFreshness } from "./migration-freshness.js";
import { effectiveCompletion } from "./effective-completion.js";
import { readProjectConfig } from "../workspace/project-config.js";
import { readDefectLedger } from "../defects/store.js";
import { changeBase } from "../git/change-base.js";
import {
  changeDir,
  contract,
  executionPlan,
  sources,
  taskSource,
  workflow,
  type Cycle,
} from "./plan.js";
import {
  currentGreen,
  historicalValid,
  redValid,
  codeState,
} from "./proofs.js";
import { hashFile, local, refuse, save } from "./files.js";
import { readState } from "./state.js";
import { taskMaterials } from "./context-material.js";
import { checkFinalScope, currentOutside } from "./scope.js";
export function context(
  root: string,
  change: string,
  taskId: string,
  maxBytes?: number,
) {
  const pin = workflow(root, change);
  const source = taskSource(root, change);
  const task = source.tasks.find((t) => t.number === taskId);
  if (!task) refuse(`Unknown task: ${taskId}`);
  const cycles = executionPlan(root, change, pin.version === 2);
  const selected = cycles.find((c) => c.tasks.includes(taskId));
  const c: Cycle = selected ?? {
    id: "legacy",
    mode: "behavior",
    tasks: [taskId],
    dependsOn: [],
    files: task.files.map((path) => ({ path, symbols: [] })),
    testFiles: [],
    inputs: [],
    environment: [],
    command: "",
    expectedFailure: "",
    design: [],
    acceptance: [],
    controls: [],
  };
  const completion = pin.version === 2 ? effectiveCompletion(root, change, cycles) : undefined;
  const content = sources(root, change, c);
  const s = selected ? readState(root, change, c.id) : undefined;
  const valid = [];
  if (s && selected) {
    const g = currentGreen(root, change, c, s);
    if (g) {
      const r = s.runs.findLast((r) => r.phase === "red" && r.accepted)!;
      if (r) valid.push(r);
      valid.push(g);
    } else if (redValid(root, change, c, s)) {
      valid.push(s.runs.findLast((r) => r.phase === "red" && r.accepted)!);
    }
  }
  // A valid RED is historical prerequisite, never proof of current GREEN. If a later
  // GREEN exists but is stale, expose no reusable pair.
  if (
    s?.runs.some((r) => r.phase === "green") &&
    !currentGreen(root, change, c, s)
  )
    valid.splice(0);
  const project = readProjectConfig(root);
  const data = {
    project_context: project.context,
    project_rules: project.rules,
    outputVersion: 1,
    change,
    task_id: taskId,
    workflow: pin,
    cycle: selected?.id ?? null,
    tasks: content.tasks,
    ...(completion ? {
      completed_tasks: c.tasks.filter(id => completion.completed.includes(id)),
      open_tasks: c.tasks.filter(id => completion.open.includes(id)),
      task_origins: Object.fromEntries(c.tasks.filter(id => completion.origins[id]).map(id => [id, completion.origins[id]])),
      migration_details: completion.details,
    } : {}),
    requirements: content.requirements,
    requirement_ids: content.requirements.map((r) => r.id),
    design_decisions: content.design,
    materials: taskMaterials(root, change, content.tasks.map((t) => t.text).join("\n")),
    allowed_files: c.files,
    test_commands: selected
      ? [c.command]
      : [...task.text.matchAll(/Check:\s*`([^`]+)`/g)].map((m) => m[1]),
    base_revision: s?.base.head ?? changeBase(root, change),
    dependencies: c.dependsOn,
    valid_evidence: valid.map(
      ({ phase, command, exitCode, log, startedAt }) => ({
        phase,
        command,
        exitCode,
        log,
        startedAt,
      }),
    ),
    historical_evidence: s?.closedAt
      ? {
          valid: historicalValid(root, change, c, s),
          state: `${changeDir(change)}/execution/${c.id}/state.json`,
        }
      : null,
    unresolved_findings: [
      ...readDefectLedger(root).defects.filter(
        (d) => d.change === change && d.state === "open",
      ),
      ...(s?.review?.report.findings.filter((f) => !f.resolved) ?? []),
    ],
    review_patch: s?.patch ?? null,
    acceptance: c.acceptance,
    controls: c.controls,
    source_links: [
      ...content.tasks,
      ...content.requirements,
      ...content.design,
    ].map((x) => `${x.path}:${x.line}`),
    warnings: selected
      ? []
      : [
          "Legacy task: design decisions are not explicitly linked; add execution-plan.json to declare the full cycle context.",
        ],
    context_digest: contract(root, change, c),
  };
  if (
    maxBytes !== undefined &&
    (!Number.isSafeInteger(maxBytes) ||
      maxBytes <= 0 ||
      Buffer.byteLength(JSON.stringify(data)) > maxBytes)
  )
    refuse(
      "Context exceeds --max-bytes; no required content was dropped. Raise the limit or split the behavioural cycle explicitly",
    );
  return data;
}
export function continuation(root: string, change: string, persist = false) {
  const pin = workflow(root, change);
  const cycles = executionPlan(root, change, pin.version === 2);
  const tasks = taskSource(root, change).tasks;
  const states = cycles.map((c) => ({ c, s: readState(root, change, c.id) }));
  const completion = effectiveCompletion(root, change, cycles);
  const completed = completion.completed;
  const next = states.find(({ c }) =>
    !completion.cycles.find(x => x.id === c.id)!.complete &&
    c.dependsOn.every(id => completion.cycles.find(x => x.id === id)?.complete));
  const result = {
    outputVersion: 1,
    change,
    workflow: pin,
    current_revision: codeState(root),
    completed_tasks: completed,
    task_origins: completion.origins,
    migration_details: completion.details,
    valid_evidence: states.flatMap(({ c, s }) =>
      s && currentGreen(root, change, c, s)
        ? [{ cycle: c.id, log: s.runs.at(-1)!.log }]
        : [],
    ),
    unresolved_findings: [
      ...cycleProblems(root, change).map((message) => ({ message })),
      ...readDefectLedger(root).defects.filter(
        (d) => d.change === change && d.state === "open",
      ),
      ...states.flatMap(
        ({ s }) => s?.review?.report.findings.filter((f) => !f.resolved) ?? [],
      ),
    ],
    next_step: next
      ? {
          cycle: next.c.id,
          tasks: next.c.tasks.filter(id => completion.open.includes(id)),
          dependencies: next.c.dependsOn,
          phase: next.s?.runs.at(-1)?.phase ?? "not-started",
        }
      : { command: `lexforge verify --change ${change}` },
    open_tasks: tasks
      .filter((t) => !completed.includes(t.number))
      .map((t) => t.number),
    sources: states
      .filter(({ s }) => s)
      .map(({ c }) => `${changeDir(change)}/execution/${c.id}/state.json`),
  };
  if (persist)
    save(local(root, `${changeDir(change)}/continuation.json`), result);
  return result;
}
function outsideProblem(paths: string[]): string {
  return `Unreviewed changes outside the execution plan: ${paths.join(", ")}`;
}
/** A migrated change reports the outside edits by path too, once a baseline exists to compare with. */
function withOutsidePaths(
  root: string,
  change: string,
  cycles: ReturnType<typeof executionPlan>,
  issues: string[],
): string[] {
  const bare = "Unreviewed changes outside the execution plan";
  if (!issues.includes(bare)) return issues;
  try {
    const compared = checkFinalScope(root, change, cycles);
    const outside = compared.length ? compared : currentOutside(root, cycles);
    return issues.map((issue) =>
      issue !== bare || outside.length === 0 ? issue : outsideProblem(outside),
    );
  } catch {
    const outside = currentOutside(root, cycles); // no baseline yet
    return issues.map((issue) =>
      issue !== bare || outside.length === 0 ? issue : outsideProblem(outside),
    );
  }
}
export function cycleProblems(root: string, change: string): string[] {
  if (workflow(root, change).version !== 2) return [];
  try {
    const cycles = executionPlan(root, change, true);
    const completion = effectiveCompletion(root, change, cycles);
    if (completion.ledger) {
      return [...withOutsidePaths(root, change, cycles, migrationFreshness(root, change, cycles, completion.ledger)),
        ...completion.open.map(id => {
          const task = completion.ledger!.tasks.find(t => t.id === id);
          return `Migration task ${id}: ${task?.classification ?? "incomplete"}; ${task?.gaps[0]?.minimumAction ?? "complete native execution and review"}`;
        }),
        ...completion.cycles.filter(c => !c.complete).map(c => `Cycle ${c.id} is partially complete or open: ${c.open.join(", ")}`),
      ];
    }
    const issues: string[] = [];
    const outside = checkFinalScope(root, change, cycles);
    if (outside.length > 0) issues.push(outsideProblem(outside));
    const closed = cycles
      .flatMap((c) => {
        const s = readState(root, change, c.id);
        if (!s || !historicalValid(root, change, c, s)) {
          issues.push(
            `Cycle ${c.id} has no valid closed execution and independent review`,
          );
          return [];
        }
        return [s];
      })
      .sort((a, b) => a.closedAt!.localeCompare(b.closedAt!));
    const latest = new Map<string, string>();
    for (const s of closed)
      for (const [file, hash] of Object.entries(s.runs.at(-1)!.snapshotHashes))
        latest.set(file, hash);
    for (const [file, hash] of latest)
      if (hashFile(root, file) !== hash)
        issues.push(
          `Unreviewed changes after the latest closed cycle: ${file}`,
        );
    return issues;
  } catch (error) {
    return [(error as Error).message];
  }
}
