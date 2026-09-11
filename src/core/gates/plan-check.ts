import path from "node:path";

import { UsageError } from "../../cli/errors.js";
import { answerPath, workspacePath } from "../answer-path.js";
import { readTextFile, splitTextLines } from "../read-text.js";
import { readChangeState } from "../status/change-status.js";
import type { CommandResult } from "../types.js";
import { makeFinding, type Finding } from "../validation/finding.js";
import { findWorkspaceRoot } from "../workspace/find-root.js";
import { readProjectConfig } from "../workspace/project-config.js";
import { checkCoverage, readDeltaSpecs } from "./coverage-rules.js";
import { checkIdentifiers } from "./identifier-rules.js";
import { checkPlaceholders } from "./placeholder-rules.js";
import { parseTaskList, type PlanTask, type PlanTasks } from "./task-list.js";

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
  const content = readTextFile(artifact.resolvedOutputPath);
  const plan: PlanTasks = {
    file,
    tasks: parseTaskList(content),
  };

  const findings = [
    ...checkPlaceholders(plan, config.planPlaceholders),
    ...checkCoverage(plan, readDeltaSpecs(root, options.change)),
    ...checkIdentifiers(plan),
    ...checkSectionDependencies(plan, parseSections(content, plan.tasks)),
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

/** A section heading: `## <number>. <name>`. */
const SECTION_HEADING = /^##\s+(\d+)\.\s*(.*)$/;

/** The `Depends on:` line under a heading, before the section's first task. */
const DEPENDS_ON_LINE = /^Depends on:\s*(.+)$/i;

/** One numbered section of the plan, as the dependency rules read it. */
export interface PlanSection {
  /** Section number, such as `4`. */
  number: string;
  /** Line of the `## N. Title` heading, counted from 1. */
  headingLine: number;
  /**
   * Line of the section's first `Depends on:` line, or `undefined` when it
   * has none at all.
   */
  dependsOnLine: number | undefined;
  /** True when the section carries more than one `Depends on:` line. */
  dependsOnRepeated: boolean;
  /**
   * True when every `Depends on:` line the section carries is neither
   * `none` nor names a single section — a placeholder such as `TBD` left in
   * the line's place.
   */
  dependsOnUnreadable: boolean;
  /**
   * Section numbers this section names, read across every `Depends on:`
   * line it carries and merged into one set. Empty for `none`, empty when
   * every line is unreadable, and empty when the section has no line at
   * all — a section in either of the last two states gets its own finding
   * and is not otherwise assumed to depend on anything.
   */
  dependsOn: string[];
  /** Files named by this section's own tasks, in the order first seen. */
  files: string[];
}

/**
 * Reads the numbered sections of the plan: where each one starts, what its
 * `Depends on:` line says, and which files its own tasks name. The files
 * come straight off `PlanTask.files` — the same extraction `coverage-rules.ts`
 * reads `task.links` off — grouped by which section's line range a task
 * falls in, not by matching its number against the section's. A span that
 * ends in `/` is dropped: a directory is not a file two sections can
 * conflict over.
 */
export function parseSections(content: string, tasks: PlanTask[]): PlanSection[] {
  const lines = splitTextLines(content);
  const headings: { number: string; line: number }[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = SECTION_HEADING.exec(lines[index]!);
    if (match) {
      headings.push({ number: match[1]!, line: index + 1 });
    }
  }

  return headings.map((heading, index) => {
    const nextHeadingLine = headings[index + 1]?.line ?? lines.length + 1;
    const sectionTasks = tasks.filter(
      (task) => task.line > heading.line && task.line < nextHeadingLine,
    );
    const firstTaskLine = sectionTasks[0]?.line ?? nextHeadingLine;

    const matches: { line: number; raw: string }[] = [];
    for (let lineNo = heading.line + 1; lineNo < firstTaskLine; lineNo += 1) {
      const match = DEPENDS_ON_LINE.exec(lines[lineNo - 1]!.trim());
      if (match) {
        matches.push({ line: lineNo, raw: match[1]!.trim() });
      }
    }

    let dependsOnLine: number | undefined;
    let dependsOnUnreadable = false;
    const dependsOn: string[] = [];

    if (matches.length > 0) {
      dependsOnLine = matches[0]!.line;
      let anyReadable = false;

      for (const { raw } of matches) {
        if (raw.toLowerCase() === "none") {
          anyReadable = true;
          continue;
        }

        const found = [...raw.matchAll(/\d+/g)].map((match) => match[0]!);
        if (found.length > 0) {
          anyReadable = true;
          for (const number of found) {
            if (!dependsOn.includes(number)) {
              dependsOn.push(number);
            }
          }
        }
      }

      dependsOnUnreadable = !anyReadable;
    }

    const files: string[] = [];
    for (const task of sectionTasks) {
      for (const file of task.files) {
        if (!file.endsWith("/") && !files.includes(file)) {
          files.push(file);
        }
      }
    }

    return {
      number: heading.number,
      headingLine: heading.line,
      dependsOnLine,
      dependsOnRepeated: matches.length > 1,
      dependsOnUnreadable,
      dependsOn,
      files,
    };
  });
}

/**
 * The seven rules over the sections of the plan: a repeated section number, a
 * repeated `Depends on:` line, an unreadable value on it, a missing line
 * entirely, a line naming a section the plan does not have, two sections
 * that wait for each other, and two sections that become ready at the same
 * moment and name the same file. The last two both need the graph of
 * resolved edges — a dependency the plan does not have is dropped from it,
 * already reported by its own rule.
 */
function checkSectionDependencies(plan: PlanTasks, sections: PlanSection[]): Finding[] {
  const findings: Finding[] = [];

  const byNumberGroups = new Map<string, PlanSection[]>();
  for (const section of sections) {
    const group = byNumberGroups.get(section.number);
    if (group) {
      group.push(section);
    } else {
      byNumberGroups.set(section.number, [section]);
    }
  }

  for (const [number, group] of byNumberGroups) {
    if (group.length > 1) {
      for (const section of group) {
        findings.push(
          makeFinding(
            plan.file,
            section.headingLine,
            "section-number-repeated",
            `Section number ${number} is used by more than one "## ${number}. ..." heading ` +
              "in this plan. Give each section its own number.",
          ),
        );
      }
    }
  }

  // A repeated number leaves this plan's graph unreliable — which of the
  // sections sharing a number a dependency on it means is not for this
  // rule to guess — so only a number used once takes part in it.
  const byNumber = new Map(
    [...byNumberGroups].filter(([, group]) => group.length === 1).map(([number, group]) => [
      number,
      group[0]!,
    ]),
  );
  const usableSections = sections.filter((section) => byNumber.has(section.number));

  for (const section of usableSections) {
    if (section.dependsOnRepeated) {
      findings.push(
        makeFinding(
          plan.file,
          section.dependsOnLine ?? section.headingLine,
          "section-depends-on-repeated",
          `Section ${section.number} carries more than one "Depends on:" line. Every one of ` +
            "them was read, but a section names its dependencies once.",
        ),
      );
    }

    if (section.dependsOnUnreadable) {
      findings.push(
        makeFinding(
          plan.file,
          section.dependsOnLine ?? section.headingLine,
          "section-depends-on-unreadable",
          `Section ${section.number}'s "Depends on:" line names no section and is not ` +
            `"none". Write "none", or the sections it needs closed first.`,
        ),
      );
    }

    if (section.dependsOnLine === undefined) {
      findings.push(
        makeFinding(
          plan.file,
          section.headingLine,
          "section-missing-depends-on",
          `Section ${section.number} carries no "Depends on:" line. Add one naming the ` +
            `sections it needs closed first, or the word "none".`,
        ),
      );
    }
  }

  for (const section of usableSections) {
    for (const dependency of section.dependsOn) {
      if (!byNumber.has(dependency)) {
        findings.push(
          makeFinding(
            plan.file,
            section.dependsOnLine ?? section.headingLine,
            "section-unknown-dependency",
            `Section ${section.number} names "Depends on: section ${dependency}", and the ` +
              `plan has no section ${dependency}.`,
          ),
        );
      }
    }
  }

  const edges = new Map<string, Set<string>>(
    usableSections.map((section) => [
      section.number,
      new Set(section.dependsOn.filter((dependency) => byNumber.has(dependency))),
    ]),
  );

  findings.push(...findCycles(plan, usableSections, byNumber, edges));
  findings.push(...findConcurrentFiles(plan, usableSections, edges));

  return findings;
}

/**
 * A cycle: two sections that each, directly or through others, wait for the
 * other. A DFS that tracks which sections stand on the current path finds a
 * cycle exactly where an edge leads back to one of them — the edge is the
 * pair reported, not the whole path, which is enough to act on and does not
 * grow with how long the cycle is.
 */
function findCycles(
  plan: PlanTasks,
  sections: PlanSection[],
  byNumber: Map<string, PlanSection>,
  edges: Map<string, Set<string>>,
): Finding[] {
  const findings: Finding[] = [];
  const state = new Map<string, "visiting" | "done">();
  const reported = new Set<string>();

  const visit = (number: string): void => {
    if (state.get(number) === "done") {
      return;
    }

    state.set(number, "visiting");
    for (const dependency of edges.get(number) ?? []) {
      if (state.get(dependency) === "visiting") {
        const pairKey = [number, dependency].sort().join("~");
        if (!reported.has(pairKey)) {
          reported.add(pairKey);
          const section = byNumber.get(number)!;
          const message =
            number === dependency
              ? `Section ${number} names itself on its own "Depends on:" line. A section ` +
                "cannot wait for itself."
              : `Section ${number} and section ${dependency} wait for each other: neither ` +
                "can close first, so neither is ever ready.";
          findings.push(
            makeFinding(
              plan.file,
              section.dependsOnLine ?? section.headingLine,
              "section-dependency-cycle",
              message,
            ),
          );
        }
        continue;
      }

      visit(dependency);
    }
    state.set(number, "done");
  };

  for (const section of sections) {
    visit(section.number);
  }

  return findings;
}

/** Every section reachable from `start` by following `edges`, `start` itself excluded. */
function reachableFrom(start: string, edges: Map<string, Set<string>>): Set<string> {
  const seen = new Set<string>();
  const stack = [...(edges.get(start) ?? [])];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    for (const next of edges.get(current) ?? []) {
      stack.push(next);
    }
  }

  return seen;
}

/**
 * Two sections are concurrent when neither's `Depends on:` leads to the
 * other, directly or through the sections it leads to. A concurrent pair
 * naming the same file is a finding: both become ready together, both are
 * dispatched together, and each agent's edit of that file loses the other's.
 */
function findConcurrentFiles(
  plan: PlanTasks,
  sections: PlanSection[],
  edges: Map<string, Set<string>>,
): Finding[] {
  const findings: Finding[] = [];
  const reachable = new Map(
    sections.map((section) => [section.number, reachableFrom(section.number, edges)]),
  );

  for (let i = 0; i < sections.length; i += 1) {
    for (let j = i + 1; j < sections.length; j += 1) {
      const left = sections[i]!;
      const right = sections[j]!;

      if (reachable.get(left.number)!.has(right.number)) continue;
      if (reachable.get(right.number)!.has(left.number)) continue;

      for (const leftFile of left.files) {
        for (const rightFile of right.files) {
          if (!sameFile(leftFile, rightFile)) {
            continue;
          }

          const named =
            leftFile === rightFile
              ? leftFile
              : `${leftFile} in section ${left.number}, the same file as ${rightFile} in ` +
                `section ${right.number}`;

          findings.push(
            makeFinding(
              plan.file,
              right.headingLine,
              "section-concurrent-file",
              `Section ${left.number} and section ${right.number} are concurrent — neither's ` +
                `"Depends on:" leads to the other — and both name ${named}. Dispatched ` +
                "together, each would lose the other's edit of it.",
            ),
          );
        }
      }
    }
  }

  return findings;
}

/** Everything after the last `/` of a span, or the whole span when it holds none. */
function basename(span: string): string {
  const index = span.lastIndexOf("/");
  return index === -1 ? span : span.slice(index + 1);
}

/**
 * Whether two backticked spans name the same file. Equal in full text is
 * always the same file; beyond that, only a bare name — one span holding no
 * `/` at all — is taken to be a short spelling of the other's basename.
 * Two full paths are never matched by basename alone:
 * `skills/lexforge-apply/SKILL.md` and `skills/lexforge-verify/SKILL.md`
 * are different files, and a hard gate with no flag to quiet it must not
 * cry wolf over two files that both happen to be called `SKILL.md`.
 */
function sameFile(left: string, right: string): boolean {
  if (left === right) {
    return true;
  }

  if (!left.includes("/") && left === basename(right)) {
    return true;
  }

  if (!right.includes("/") && right === basename(left)) {
    return true;
  }

  return false;
}
