import { makeFinding, type Finding } from "../validation/finding.js";
import { findConcurrentFiles } from "./plan-check-groups.js";
import type { PlanTasks } from "./task-list.js";
import type { PlanSection } from "./plan-check-sections-parse.js";

export type { PlanSection } from "./plan-check-sections-parse.js";
export { parseSections, readDependsOn, collectSectionFiles } from "./plan-check-sections-parse.js";

/**
 * The seven rules over the sections of the plan: a repeated section number, a
 * repeated `Depends on:` line, an unreadable value on it, a missing line
 * entirely, a line naming a section the plan does not have, two sections
 * that wait for each other, and two sections that become ready at the same
 * moment and name the same file. The last two both need the graph of
 * resolved edges — a dependency the plan does not have is dropped from it,
 * already reported by its own rule.
 */
export function checkSectionDependencies(plan: PlanTasks, sections: PlanSection[]): Finding[] {
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
          section.file,
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
          section.file,
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
            section.file,
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

  findings.push(...findCycles(usableSections, byNumber, edges));
  findings.push(...findConcurrentFiles(plan, usableSections, edges));
  findings.push(...checkSectionTasksInline(sections));

  return findings;
}

/**
 * A section's tasks and `Depends on:` line belong in a file of their own,
 * linked from the index - never directly under the heading in `tasks.md`.
 * Two shapes break that: a section never resolved out of a linked file at
 * all (`file` equals `headingFile`, set by `readPlanSource` only when no
 * link was found), and a section that does link to a file of its own but
 * still carries a `Depends on:` line or a task behind that link inside
 * `tasks.md` (`linkTrailingLine` is set). There is no exemption for either
 * shape: not a plan of one section, not a plan still being written.
 */
function checkSectionTasksInline(sections: PlanSection[]): Finding[] {
  const findings: Finding[] = [];

  for (const section of sections) {
    if (section.file === section.headingFile) {
      findings.push(
        makeFinding(
          section.headingFile,
          section.headingLine,
          "section-tasks-inline",
          `Section ${section.number}'s "Depends on:" line and tasks sit directly under its ` +
            `heading in tasks.md. Move them into a file of their own and link it from the index.`,
        ),
      );
      continue;
    }

    if (section.linkTrailingLine !== undefined) {
      findings.push(
        makeFinding(
          section.headingFile,
          section.linkTrailingLine,
          "section-tasks-inline",
          `Section ${section.number} links to a file of its own, but still carries a ` +
            `"Depends on:" line or a task directly behind that link in tasks.md. Remove them, ` +
            "keeping the link as the section's only content under its heading.",
        ),
      );
    }
  }

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
              section.file,
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
export function reachableFrom(start: string, edges: Map<string, Set<string>>): Set<string> {
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
