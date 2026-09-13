import { UsageError } from "../../cli/errors.js";
import { answerPath, workspacePath } from "../answer-path.js";
import { readChangeState } from "../status/change-status.js";
import type { CommandResult } from "../types.js";
import { type Finding } from "../validation/finding.js";
import { findWorkspaceRoot } from "../workspace/find-root.js";
import { readProjectConfig } from "../workspace/project-config.js";
import { checkCoverage, readDeltaSpecs } from "./coverage-rules.js";
import {
  checkGroupCoverage,
  checkGroupSharedFiles,
  checkTaskGroupLabels,
} from "./plan-check-groups.js";
import { checkIdentifiers } from "./identifier-rules.js";
import { checkPlaceholders } from "./placeholder-rules.js";
import { checkSectionDependencies, type PlanSection } from "./plan-check-sections.js";
import { readPlanSource } from "./plan-source.js";
import type { PlanTask, PlanTasks } from "./task-list.js";

/** The artifact that holds the plan. Both built-in schemas call it this. */
export const PLAN_ARTIFACT = "tasks";

/** Rules grouped by what they measure, so the counters follow the rule ids. */
const PLACEHOLDER_RULES = [
  "task-placeholder",
  "task-points-at-task",
  "task-too-short",
  "template-placeholder-left",
];
const COVERAGE_RULES = ["requirement-not-planned", "requirement-link-unknown"];
const IDENTIFIER_RULES = ["identifier-spelling"];
const SECTION_RULES = [
  "section-missing-depends-on",
  "section-unknown-dependency",
  "section-dependency-cycle",
  "section-concurrent-file",
  "section-depends-on-unreadable",
  "section-depends-on-repeated",
  "section-number-repeated",
  "section-tasks-inline",
  "task-missing-group-label",
  "section-group-coverage-mismatch",
  "section-group-shared-file",
];

export interface CheckPlanOptions {
  /** Any directory inside the project; the workspace root is looked up from it. */
  cwd: string;
  change: string;
}

export interface CheckPlanSummary {
  placeholders: number;
  coverage: number;
  identifiers: number;
  sections: number;
}

export interface CheckPlanData {
  outputVersion: 1;
  workspaceRoot: string;
  change: string;
  findings: Finding[];
  summary: CheckPlanSummary;
  nextStep: string;
}

/**
 * The self-check of the plan: placeholders, requirement coverage, one name
 * written two ways. It reads the artifacts of the change and nothing else, so
 * a project without a repository runs it just the same.
 */
export function checkPlan(options: CheckPlanOptions): CommandResult<CheckPlanData> {
  const root = findWorkspaceRoot(options.cwd);
  const config = readProjectConfig(root);
  const { state } = readChangeState(root, options.change);

  const artifact = state.artifacts.find((item) => item.id === PLAN_ARTIFACT);
  if (!artifact) {
    throw new UsageError(
      "schema-no-plan",
      `the schema of change "${options.change}" has no artifact "${PLAN_ARTIFACT}", ` +
        "so there is no plan to check.",
    );
  }

  if (artifact.status !== "done") {
    throw new UsageError(
      "artifact-missing",
      `change "${options.change}" has no plan written yet: ` +
        `${workspacePath(root, artifact.resolvedOutputPath)} is empty or absent. ` +
        "There is nothing to check until the plan is written.",
      `lexforge instructions ${PLAN_ARTIFACT} --change ${options.change}`,
    );
  }

  const file = workspacePath(root, artifact.resolvedOutputPath);
  const source = readPlanSource(artifact.resolvedOutputPath);
  const plan: PlanTasks = {
    file,
    tasks: source.tasks.map((task) => displayTask(root, task)),
  };

  const sections = source.sections.map((section) => displaySection(root, section));

  const findings = [
    ...checkPlaceholders(plan, config.planPlaceholders),
    ...checkCoverage(plan, readDeltaSpecs(root, options.change)),
    ...checkIdentifiers(plan),
    ...checkSectionDependencies(plan, sections),
    ...checkTaskGroupLabels(plan),
    ...checkGroupCoverage(sections),
    ...checkGroupSharedFiles(sections),
  ].sort((left, right) => left.line - right.line);

  const command = `lexforge check plan --change ${options.change}`;
  const nextStep =
    findings.length === 0
      ? "implement the change task by task, ticking each checkbox in tasks.md"
      : `fix the findings above, then run: ${command}`;

  const data: CheckPlanData = {
    outputVersion: 1,
    workspaceRoot: answerPath(root),
    change: options.change,
    findings,
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
 * `readPlanSource` names files as the filesystem has them; a finding names a
 * file the way every other finding of the project does, relative to the
 * workspace root. Both conversions run once, right after the plan is read, so
 * every rule below reads `task.file`, `section.file` and `section.headingFile`
 * already in that form.
 */
function displayTask(root: string, task: PlanTask): PlanTask {
  return { ...task, file: workspacePath(root, task.file) };
}

function displaySection(root: string, section: PlanSection): PlanSection {
  return {
    ...section,
    file: workspacePath(root, section.file),
    headingFile: workspacePath(root, section.headingFile),
  };
}

/**
 * Counters by rule id. They are worked out from the list of findings, and that
 * is on purpose: without them a skill would read rule ids as strings to learn
 * which of the three checks it has to go back to.
 */
function summarise(findings: Finding[]): CheckPlanSummary {
  const count = (rules: string[]): number =>
    findings.filter((finding) => rules.includes(finding.rule)).length;

  return {
    placeholders: count(PLACEHOLDER_RULES),
    coverage: count(COVERAGE_RULES),
    identifiers: count(IDENTIFIER_RULES),
    sections: count(SECTION_RULES),
  };
}

/** The plan file on its own line, every finding of it underneath. */
function renderLines(data: CheckPlanData): string[] {
  if (data.findings.length === 0) {
    return [`The plan of change "${data.change}" has no findings.`];
  }

  const lines = [data.findings[0]!.file];
  for (const finding of data.findings) {
    lines.push(`  ${finding.line}  ${finding.level}  ${finding.rule}  ${finding.message}`);
  }

  return lines;
}

