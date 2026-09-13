import path from "node:path";

import { UsageError } from "../../cli/errors.js";
import { answerPath, workspacePath } from "../answer-path.js";
import { changeBase, changedFiles } from "../git/change-base.js";
import { assertRepository } from "../git/repository.js";
import { readChangeState } from "../status/change-status.js";
import type { CommandResult } from "../types.js";
import { makeFinding, type Finding } from "../validation/finding.js";
import { findWorkspaceRoot } from "../workspace/find-root.js";
import { readProjectConfig } from "../workspace/project-config.js";
import { readDeltaSpecs, requirementKey, type DeltaSpecs } from "./coverage-rules.js";
import { DEFECT_OPEN_RULE, defectFindings } from "./defect-dimension.js";
import { PLAN_ARTIFACT } from "./plan-check.js";
import { readPlanSource } from "./plan-source.js";
import type { PlanTask, PlanTasks } from "./task-list.js";
import { describedLabels, verificationEmpty } from "./verification-labels.js";
import { evidenceFindings, redRecordFindings } from "./verify-change-evidence.js";

/**
 * What this command does not measure. Exit code 0 is the most dangerous line
 * of this gate: a skill reads it as "the check passed" and skips the half of
 * the check that is done by reading. Naming the boundary in the same answer
 * puts it in front of the reader who is already looking at the answer.
 */
export const NOT_CHECKED = [
  "whether the code follows the decisions written in design.md",
  "whether the requirements themselves cover what the change set out to do",
  "the quality of the code: naming, structure, what it costs to read",
];

/**
 * The other boundary: what this command does measure, one line per
 * dimension, printed whatever the exit code. A clean run says nothing else
 * about what happened, and without this list a reader has no way to see
 * that a dimension ran and found nothing, as opposed to never having run.
 */
export const CHECKED_DIMENSIONS = [
  "every checkbox in tasks.md is ticked",
  "every ticked task naming production work carries its own red record",
  "every delta-spec requirement has a trace in the code",
  "every label described in verification carries a fresh stamp",
  "no critical or important defect naming this change is open",
];

export interface VerifyChangeOptions {
  /** Any directory inside the project; the workspace root is looked up from it. */
  cwd: string;
  change: string;
}

export interface VerifyChangeSummary {
  openTasks: number;
  requirementsWithoutTrace: number;
  staleLabels: number;
  openDefects: number;
  unrecordedTasks: number;
}

export interface VerifyChangeData {
  outputVersion: 1;
  workspaceRoot: string;
  change: string;
  findings: Finding[];
  /** The five dimensions folded into `findings`; the same list every time. */
  dimensions: string[];
  /** What this command leaves to a person; the same list every time. */
  notChecked: string[];
  summary: VerifyChangeSummary;
  nextStep: string;
}

/**
 * The machine half of the check that runs before work is called finished. It
 * measures what a machine can measure and reports every miss as a finding, so
 * the skill reads an exit code instead of the agent's own opinion of the work.
 */
export function verifyChange(options: VerifyChangeOptions): CommandResult<VerifyChangeData> {
  const root = findWorkspaceRoot(options.cwd);
  const config = readProjectConfig(root);

  // A project that describes no checks has nothing to confirm the work with,
  // and exit code 0 here would be read by a skill as "everything passed".
  const labels = describedLabels(config);
  if (labels.length === 0) {
    throw verificationEmpty("verification-empty");
  }

  const plan = readPlan(root, options.change);

  assertRepository(root);
  const changed = changedFiles(root, changeBase(root, options.change));

  const findings = [
    ...openTaskFindings(plan),
    ...traceFindings(plan, readDeltaSpecs(root, options.change), changed),
    ...evidenceFindings(root, options.change, labels),
    ...defectFindings(root, options.change),
    ...redRecordFindings(root, options.change, plan),
  ];

  const nextStep =
    findings.length === 0
      ? "go through the list above by hand: read design.md against the code, " +
        "then judge the requirements yourself"
      : `fix the findings above, then run: lexforge verify --change ${options.change}`;

  const data: VerifyChangeData = {
    outputVersion: 1,
    workspaceRoot: answerPath(root),
    change: options.change,
    findings,
    dimensions: CHECKED_DIMENSIONS,
    notChecked: NOT_CHECKED,
    summary: summarise(findings),
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
 * The plan of the change. A change whose plan is not written has nothing to
 * verify, and exit code 0 here would read as "no tasks are left".
 */
function readPlan(root: string, change: string): PlanTasks {
  const { state } = readChangeState(root, change);
  const artifact = state.artifacts.find((item) => item.id === PLAN_ARTIFACT);

  if (!artifact) {
    throw new UsageError(
      "schema-no-plan",
      `the schema of change "${change}" has no artifact "${PLAN_ARTIFACT}", ` +
        "so there is no plan to verify.",
    );
  }

  if (artifact.status !== "done") {
    throw new UsageError(
      "artifact-missing",
      `change "${change}" has no plan written yet: ` +
        `${workspacePath(root, artifact.resolvedOutputPath)} is empty or absent. ` +
        "There is nothing to verify until the plan is written.",
      `lexforge instructions ${PLAN_ARTIFACT} --change ${change}`,
    );
  }

  const source = readPlanSource(artifact.resolvedOutputPath);

  return {
    file: workspacePath(root, artifact.resolvedOutputPath),
    tasks: source.tasks.map((task) => ({ ...task, file: workspacePath(root, task.file) })),
  };
}

/** One finding per open checkbox, naming the task and the line to open. */
function openTaskFindings(plan: PlanTasks): Finding[] {
  return plan.tasks.filter((task) => !task.done).map((task) => taskFinding(task));
}

function taskFinding(task: PlanTask): Finding {
  const number = task.number === "" ? "" : ` ${task.number}`;

  return makeFinding(
    task.file,
    task.line,
    "task-not-done",
    `Task${number} is still open: ${task.firstLine}`,
  );
}

/**
 * The second measure: whether each requirement of the delta specs left a trace
 * in the code. The trace is the chain requirement -> task -> file -> edit, and
 * the words of the requirement are never looked for in the sources: they turn
 * up in half the files by accident and in the right file not at all.
 */
function traceFindings(plan: PlanTasks, delta: DeltaSpecs, changed: string[]): Finding[] {
  if (delta.skipped) {
    return [];
  }

  const byRequirement = new Map<string, PlanTask[]>();
  for (const task of plan.tasks) {
    for (const link of task.links) {
      const key = requirementKey(link.capability, link.requirement);
      byRequirement.set(key, [...(byRequirement.get(key) ?? []), task]);
    }
  }

  const findings: Finding[] = [];

  for (const requirement of delta.requirements) {
    const key = requirementKey(requirement.capability, requirement.name);
    const tasks = byRequirement.get(key) ?? [];
    const missing = missingTrace(tasks, changed);

    if (missing) {
      findings.push(
        makeFinding(
          missing.anchor?.file ?? plan.file,
          missing.anchor?.line ?? 1,
          "requirement-without-trace",
          `Requirement "${requirement.name}" of capability "${requirement.capability}" ` +
            `has no trace in the code: ${missing.reason}`,
        ),
      );
    }
  }

  return findings;
}

/**
 * Why a requirement counts as untraced, or nothing when it does not. Both
 * halves have to hold: every task that points at it is ticked, and at least one
 * file those tasks name is different from the base commit of the change. The
 * anchor names the task the reason talks about, so the finding's pointer never
 * disagrees with its own message - a requirement no task names has none.
 */
function missingTrace(
  tasks: PlanTask[],
  changed: string[],
): { reason: string; anchor: PlanTask | undefined } | undefined {
  if (tasks.length === 0) {
    return {
      reason:
        "no task of the plan points at it. Add the task that carries it out and " +
        "end its line with the reference to this requirement",
      anchor: undefined,
    };
  }

  const open = tasks.filter((task) => !task.done);
  if (open.length > 0) {
    return {
      reason: `${listTasks(open)} that points at it is still open, so nothing has carried it out yet`,
      anchor: open[0],
    };
  }

  const files = [...new Set(tasks.flatMap((task) => task.files))];
  if (files.length === 0) {
    return {
      reason:
        `${listTasks(tasks)} names no file in backticks, so there is nothing to ` +
        "compare against the base commit of the change",
      anchor: tasks[0],
    };
  }

  if (files.some((file) => changed.includes(file))) {
    return undefined;
  }

  return {
    reason:
      `${listTasks(tasks)} names ${files.join(", ")}, and none of these files ` +
      "differs from the base commit of the change",
    anchor: tasks[0],
  };
}

/** Task numbers as a message names them: "task 3.4" or "tasks 3.4, 3.5". */
function listTasks(tasks: PlanTask[]): string {
  const numbers = tasks.map((task) => task.number || `line ${task.line}`);

  return numbers.length === 1 ? `task ${numbers[0]}` : `tasks ${numbers.join(", ")}`;
}

/**
 * Counters by rule id. A skill reads them to learn which of the measures it has
 * to go back to, instead of matching rule ids as strings.
 */
function summarise(findings: Finding[]): VerifyChangeSummary {
  const count = (rule: string): number =>
    findings.filter((finding) => finding.rule === rule).length;

  return {
    openTasks: count("task-not-done"),
    requirementsWithoutTrace: count("requirement-without-trace"),
    staleLabels: count("evidence-not-fresh"),
    openDefects: count(DEFECT_OPEN_RULE),
    unrecordedTasks: count("task-no-red-record"),
  };
}

/**
 * The findings under the file they were found in, and then the boundary of the
 * check. The boundary is printed whatever the exit code: a clean run is exactly
 * when a reader is most likely to take it for the whole check.
 */
function renderLines(data: VerifyChangeData): string[] {
  const lines: string[] = ["This command checks:"];
  for (const item of data.dimensions) {
    lines.push(`  - ${item}`);
  }
  lines.push("");
  let file = "";

  if (data.findings.length === 0) {
    lines.push(`Change "${data.change}" passes every check this command can make.`);
  }

  for (const finding of data.findings) {
    if (finding.file !== file) {
      file = finding.file;
      lines.push(file);
    }
    lines.push(`  ${finding.line}  ${finding.level}  ${finding.rule}  ${finding.message}`);
  }

  lines.push("", "This command does not check:");
  for (const item of data.notChecked) {
    lines.push(`  - ${item}`);
  }

  return lines;
}
