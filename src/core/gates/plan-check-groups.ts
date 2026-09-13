import { makeFinding, type Finding } from "../validation/finding.js";
import { reachableFrom, type PlanSection } from "./plan-check-sections.js";
import type { PlanTasks } from "./task-list.js";

/**
 * A task with no group label. Every task is a finding when it carries none,
 * in every plan - a plan that never adopts labels stays outside the check
 * forever if it were exempt for that, and this project refuses that kind of
 * soft gate.
 */
export function checkTaskGroupLabels(plan: PlanTasks): Finding[] {
  const findings: Finding[] = [];
  for (const task of plan.tasks) {
    if (task.groups.length === 0) {
      findings.push(
        makeFinding(
          task.file,
          task.line,
          "task-missing-group-label",
          `Task ${task.number || task.firstLine} carries no group label. Add one such as ` +
            `"[A]" right after the number, naming the agent that takes the task whole.`,
        ),
      );
    }
  }

  return findings;
}

/**
 * A task whose labels cover it more than once. One label answers "which
 * agent takes this task"; two leave that answer ambiguous, the same way no
 * label does, except a task carrying zero labels already has its own
 * finding above and is not reported twice here.
 */
export function checkGroupCoverage(sections: PlanSection[]): Finding[] {
  const findings: Finding[] = [];

  for (const section of sections) {
    for (const task of section.tasks) {
      if (task.groups.length > 1) {
        findings.push(
          makeFinding(
            section.file,
            task.line,
            "section-group-coverage-mismatch",
            `Section ${section.number}'s task ${task.number} carries ${task.groups.length} ` +
              `group labels (${task.groups.join(", ")}). A task's labels cover it exactly once.`,
          ),
        );
      }
    }
  }

  return findings;
}

/**
 * Two groups of one section naming the same file in backticks. This is the
 * rule that keeps a TDD triple from being split across two agents without a
 * rule of its own: the task that writes the test, the task that watches it
 * fail, and the task that writes the implementation all name the same file
 * somewhere in their own line or their `Check:` command, so landing them in
 * different groups already trips this count. Reuses `sameFile`, the same
 * comparison `findConcurrentFiles` already runs between two sections, asked
 * instead between two groups inside one.
 */
export function checkGroupSharedFiles(sections: PlanSection[]): Finding[] {
  const findings: Finding[] = [];

  for (const section of sections) {
    const byGroup = new Map<string, { line: number; files: string[] }>();

    for (const task of section.tasks) {
      for (const group of task.groups) {
        const entry = byGroup.get(group);
        const taskFiles = task.namedFiles.filter((file) => !file.endsWith("/"));

        if (entry) {
          for (const file of taskFiles) {
            if (!entry.files.includes(file)) {
              entry.files.push(file);
            }
          }
        } else {
          byGroup.set(group, { line: task.line, files: [...taskFiles] });
        }
      }
    }

    const groups = [...byGroup.keys()];
    for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        const leftGroup = groups[i]!;
        const rightGroup = groups[j]!;
        const left = byGroup.get(leftGroup)!;
        const right = byGroup.get(rightGroup)!;

        for (const leftFile of left.files) {
          for (const rightFile of right.files) {
            if (!sameFile(leftFile, rightFile)) {
              continue;
            }

            const named =
              leftFile === rightFile
                ? leftFile
                : `${leftFile} in group ${leftGroup}, the same file as ${rightFile} in group ` +
                  `${rightGroup}`;

            findings.push(
              makeFinding(
                section.file,
                right.line,
                "section-group-shared-file",
                `Section ${section.number}'s groups ${leftGroup} and ${rightGroup} both name ` +
                  `${named}. Dispatched to two agents, one would land without the other's edit ` +
                  "of it - move both groups' tasks into one.",
              ),
            );
          }
        }
      }
    }
  }

  return findings;
}

/**
 * Two sections are concurrent when neither's `Depends on:` leads to the
 * other, directly or through the sections it leads to. A concurrent pair
 * naming the same file is a finding: both become ready together, both are
 * dispatched together, and each agent's edit of that file loses the other's.
 */
export function findConcurrentFiles(
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
