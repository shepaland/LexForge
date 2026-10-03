import {
  type RawCycle,
  type MigrationFinding,
  issue,
  relative,
} from "./migration-analysis.js";
import { changeDir, taskSource } from "./plan.js";
function reaches(cycles: RawCycle[], start: string, target: string): boolean {
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visited.has(id)) return false;
    visited.add(id);
    const cycle = cycles.find((candidate) => candidate.id === id);
    return (cycle?.dependsOn ?? []).some(
      (dependency) => dependency === target || visit(dependency),
    );
  };
  return visit(start);
}

export function planAnalysis(
  root: string,
  change: string,
  source: ReturnType<typeof taskSource>,
  cycles: RawCycle[],
): { findings: MigrationFinding[]; required: Map<string, Set<string>> } {
  const planPath = `${changeDir(change)}/execution-plan.json`;
  const findings: MigrationFinding[] = [];
  const required = new Map<string, Set<string>>();
  const taskIds = new Set(source.tasks.map((task) => task.number));
  const cycleIds = cycles.map((cycle) => cycle.id);
  const owners = new Map<string, string[]>();
  for (const id of new Set(cycleIds))
    if (cycleIds.filter((candidate) => candidate === id).length > 1)
      findings.push(
        issue(
          "cycle-map-duplicate-cycle",
          `cycle id ${id} appears more than once`,
          "give every cycle a unique id",
          planPath,
          { cycle: id },
        ),
      );
  const knownCycles = new Set(cycleIds);
  for (const cycle of cycles) {
    for (const task of cycle.tasks) {
      owners.set(task, [...(owners.get(task) ?? []), cycle.id]);
      if (!taskIds.has(task))
        findings.push(
          issue(
            "cycle-map-unknown-task",
            `cycle ${cycle.id} maps unknown task ${task}`,
            "remove the unknown id or restore the original task",
            planPath,
            { task, cycle: cycle.id },
          ),
        );
      const acceptance = (cycle.acceptance ?? []).filter(
        (item) => item.task === task,
      );
      if (
        acceptance.length === 0 &&
        source.tasks
          .find((t) => t.number === task)
          ?.files.some((f) => !f.startsWith("tests/"))
      )
        findings.push(
          issue(
            "cycle-map-acceptance-missing",
            `task ${task} has no mapped acceptance criterion`,
            "map at least one stable acceptance id to the task",
            planPath,
            { task, cycle: cycle.id },
          ),
        );
    }
    for (const item of cycle.acceptance ?? [])
      if (!cycle.tasks.includes(item.task))
        findings.push(
          issue(
            "cycle-map-acceptance-invalid",
            `acceptance ${item.id} names task ${item.task} outside cycle ${cycle.id}`,
            "map the acceptance id to a task in its cycle",
            planPath,
            { task: item.task, cycle: cycle.id },
          ),
        );
    for (const dependency of cycle.dependsOn ?? [])
      if (!knownCycles.has(dependency))
        findings.push(
          issue(
            "cycle-dependency-missing",
            `cycle ${cycle.id} depends on missing cycle ${dependency}`,
            "restore the predecessor cycle or repair dependsOn",
            planPath,
            { cycle: cycle.id },
          ),
        );
    if (reaches(cycles, cycle.id, cycle.id))
      findings.push(
        issue(
          "cycle-dependency-loop",
          `cycle dependency loop reaches ${cycle.id}`,
          "remove the dependency loop",
          planPath,
          { cycle: cycle.id },
        ),
      );
  }
  for (const task of source.tasks) {
    const mapped = owners.get(task.number) ?? [];
    if (mapped.length === 0)
      findings.push(
        issue(
          "cycle-map-missing-task",
          `task ${task.number} is absent from execution-plan.json`,
          "map the task to exactly one behavioural cycle",
          relative(root, task.file),
          { task: task.number },
        ),
      );
    if (mapped.length > 1)
      findings.push(
        issue(
          "cycle-map-duplicate-task",
          `task ${task.number} is mapped by ${mapped.join(", ")}`,
          "leave the task in exactly one cycle",
          planPath,
          { task: task.number },
        ),
      );
  }
  for (const section of source.sections) {
    const sectionCycles = cycles.filter((cycle) =>
      cycle.tasks.some((id) =>
        section.tasks.some((task) => task.number === id),
      ),
    );
    const sectionFields = {
      task: section.tasks[0]?.number,
      cycle: sectionCycles[0]?.id,
    };
    const sectionSource = relative(root, section.file);
    if (section.dependsOnLine === undefined)
      findings.push(
        issue(
          "section-dependency-missing",
          `section ${section.number} has no Depends on declaration`,
          'add one "Depends on:" line naming predecessor sections or "none"',
          sectionSource,
          sectionFields,
        ),
      );
    if (section.dependsOnRepeated)
      findings.push(
        issue(
          "section-dependency-repeated",
          `section ${section.number} has more than one Depends on declaration`,
          "leave exactly one Depends on declaration in the section",
          sectionSource,
          sectionFields,
        ),
      );
    if (section.dependsOnUnreadable)
      findings.push(
        issue(
          "section-dependency-unreadable",
          `section ${section.number} has an unreadable Depends on declaration`,
          'name predecessor section numbers or use "none"',
          sectionSource,
          sectionFields,
        ),
      );
    for (const dependency of section.dependsOn) {
      const predecessor = source.sections.find(
        (candidate) => candidate.number === dependency,
      );
      if (!predecessor) {
        findings.push(
          issue(
            "section-dependency-unknown",
            `section ${section.number} depends on unknown section ${dependency}`,
            "restore the predecessor section or repair the Depends on declaration",
            sectionSource,
            sectionFields,
          ),
        );
        continue;
      }
      const predecessorCycles = cycles.filter((cycle) =>
        cycle.tasks.some((id) =>
          predecessor.tasks.some((task) => task.number === id),
        ),
      );
      for (const owner of sectionCycles)
        for (const predecessorCycle of predecessorCycles) {
          for (const task of section.tasks) {
            const set = required.get(task.number) ?? new Set<string>();
            set.add(predecessorCycle.id);
            required.set(task.number, set);
          }
          if (
            owner.id !== predecessorCycle.id &&
            !reaches(cycles, owner.id, predecessorCycle.id)
          )
            findings.push(
              issue(
                "cycle-map-section-dependency-missing",
                `cycle ${owner.id} omits original section dependency ${predecessorCycle.id}`,
                `add ${predecessorCycle.id} to ${owner.id}.dependsOn`,
                relative(root, section.file),
                { task: section.tasks[0]?.number, cycle: owner.id },
              ),
            );
        }
    }
  }
  findings.sort((left, right) =>
    `${left.code}\0${left.task ?? ""}\0${left.cycle ?? ""}`.localeCompare(
      `${right.code}\0${right.task ?? ""}\0${right.cycle ?? ""}`,
    ),
  );
  return { findings, required };
}
