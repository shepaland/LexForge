import { makeFinding, type Finding } from "../validation/finding.js";
import type { PlanTasks } from "./task-list.js";

/** Reports every invalid explicit Files declaration at its task line. */
export function checkTaskFileDeclarations(plan: PlanTasks): Finding[] {
  return plan.tasks.flatMap((task) =>
    (task.fileDeclarationProblems ?? []).map((problem) => {
      const detail =
        problem.kind === "repeated"
          ? "repeats the Files declaration"
          : problem.kind === "unsafe"
            ? `declares unsafe or noncanonical path ${problem.value}`
            : "has a malformed or empty Files declaration";
      return makeFinding(
        task.file,
        task.line,
        "task-file-declaration",
        `Task ${task.number || task.firstLine} ${detail}. Use one Files: line containing comma-separated canonical workspace-relative paths in backticks.`,
      );
    }),
  );
}
