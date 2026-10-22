import { makeFinding, type Finding } from "../validation/finding.js";
import type { PlanSection } from "./plan-check-sections-parse.js";
import type { PlanTask, PlanTasks } from "./task-list.js";

const DECLARATION_FIX =
  "Add one Files line with the paths the task writes, each in backticks, comma-separated.";

/** Reads every field of every task: what is missing, malformed, unknown, or unordered. */
export function checkTaskFields(plan: PlanTasks, sections: PlanSection[]): Finding[] {
  const findings: Finding[] = [];
  const index = new Map<string, number>();
  plan.tasks.forEach((task, position) => {
    if (task.number !== "" && !index.has(task.number)) index.set(task.number, position);
  });

  plan.tasks.forEach((task, position) => {
    const name = `Task ${task.number || task.firstLine}`;
    const at = (rule: string, message: string): void => {
      findings.push(makeFinding(task.file, task.line, rule, message));
    };
    const problem = (field: string): boolean => task.fieldProblems.some((item) => item.field === field);

    if (task.files.length === 0 && task.fileDeclarationProblems.length === 0) {
      at("task-missing-files", `${name} has no Files line. ${DECLARATION_FIX}`);
    }
    if (task.tests.length === 0 && !task.declaresMove && !problem("Test")) {
      at(
        "task-missing-test",
        `${name} names no test. Add a Test line with the test file the task writes, in backticks, ` +
          "or mark a task that only carries code with (move) right after its number.",
      );
    }
    if (task.command === null && !problem("Command")) {
      at(
        "task-missing-command",
        `${name} has no command. Add a Command line with the one command that runs its test, in backticks.`,
      );
    }

    for (const item of task.fieldProblems) {
      if (item.kind === "repeated") {
        at("task-field-repeated", `${name} repeats the ${item.field} line. Keep one.`);
      } else if (item.kind === "malformed") {
        at("task-field-malformed", `${name} has a malformed ${item.field} line. ${FIELD_SHAPE[item.field]}`);
      } else {
        at(
          "task-control-unknown",
          `${name} names the unknown control "${item.value}". Use authorization, cryptography, ` +
            "tenant-isolation or migrations.",
        );
      }
    }

    for (const number of task.dependsOn ?? []) {
      const target = index.get(number);
      if (target === undefined) {
        at("task-depends-on-unknown", `${name} depends on task ${number}, and the plan has no such task.`);
      } else if (target >= position) {
        at(
          "task-depends-on-forward",
          `${name} depends on task ${number}, which stands at or after it. A task depends on an earlier one.`,
        );
      }
    }
  });

  findings.push(...checkSharedFiles(plan, sections, index));
  return findings.sort((left, right) => left.line - right.line);
}

const FIELD_SHAPE: Record<string, string> = {
  Test: "Write test files in backticks, comma-separated, as canonical paths.",
  Command: "Write exactly one command in backticks.",
  "Depends on": "Write task numbers separated by commas, such as 1.2, 1.3.",
  Controls: "Write control names separated by commas.",
};

/** Two tasks that write one file need an order between them, direct or through others. */
function checkSharedFiles(plan: PlanTasks, sections: PlanSection[], index: Map<string, number>): Finding[] {
  const key = (task: PlanTask): string => `${task.file}:${task.line}`;
  const position = new Map(plan.tasks.map((task, i) => [key(task), i]));
  const sectionOf = new Map<string, PlanSection>();
  for (const section of sections) for (const task of section.tasks) sectionOf.set(`${section.file}:${task.line}`, section);
  const tasksOfSection = new Map(
    sections.map((section) => [
      section.number,
      section.tasks.flatMap((task) => position.get(`${section.file}:${task.line}`) ?? []),
    ]),
  );

  const edges: number[][] = plan.tasks.map((task) => {
    const out = new Set<number>();
    for (const number of task.dependsOn ?? []) {
      const target = index.get(number);
      if (target !== undefined) out.add(target);
    }
    for (const number of sectionOf.get(key(task))?.dependsOn ?? []) {
      for (const target of tasksOfSection.get(number) ?? []) out.add(target);
    }
    return [...out];
  });

  const reaches = (from: number, to: number): boolean => {
    const seen = new Set<number>();
    const stack = [...edges[from]!];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === to) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      stack.push(...edges[current]!);
    }
    return false;
  };

  const findings: Finding[] = [];
  for (let left = 0; left < plan.tasks.length; left += 1) {
    for (let right = left + 1; right < plan.tasks.length; right += 1) {
      const a = plan.tasks[left]!;
      const b = plan.tasks[right]!;
      const shared = a.files.filter((file) => b.files.includes(file));
      if (shared.length === 0 || reaches(left, right) || reaches(right, left)) continue;
      findings.push(
        makeFinding(
          b.file,
          b.line,
          "shared-file-without-order",
          `Task ${b.number || b.firstLine} and task ${a.number || a.firstLine} both write ` +
            `${shared.join(", ")} and neither depends on the other. Add "Depends on: ` +
            `${a.number}" to the later one, or split the file.`,
        ),
      );
    }
  }
  return findings;
}
