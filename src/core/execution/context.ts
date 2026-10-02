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
import { checkFinalScope } from "./scope.js";
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
    requirements: content.requirements,
    requirement_ids: content.requirements.map((r) => r.id),
    design_decisions: content.design,
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
  const closed = states.filter(
    ({ c, s }) => s && historicalValid(root, change, c, s),
  );
  const completed = closed.flatMap(({ c }) => c.tasks);
  const next = states.find(
    ({ c }) =>
      !closed.some((x) => x.c.id === c.id) &&
      c.dependsOn.every((id) => closed.some((x) => x.c.id === id)),
  );
  const result = {
    outputVersion: 1,
    change,
    workflow: pin,
    current_revision: codeState(root),
    completed_tasks: completed,
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
          tasks: next.c.tasks,
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
export function cycleProblems(root: string, change: string): string[] {
  if (workflow(root, change).version !== 2) return [];
  try {
    const cycles = executionPlan(root, change, true);
    const issues: string[] = [];
    checkFinalScope(root, change, cycles);
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
