import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { makeFinding, type Finding } from "../validation/finding.js";
import type { ProjectConfig } from "../workspace/project-config.js";
import { countLines, isCovered, type LongFilesPath } from "./line-limit.js";
import type { PlanTasks } from "./task-list.js";

/**
 * Holds a plan to the line limit set in `.lexforge.yaml`. A file already over
 * the limit at the start of the change is not itself a finding - what is
 * missing is the plan's own account of it: which path the change follows
 * (`long_files` unset), and, on the `refactor` path, whether the split comes
 * before other work on the file (its first naming task not `(move)`).
 */
export function checkLongFiles(
  root: string,
  plan: PlanTasks,
  sizeLimit: ProjectConfig["sizeLimit"],
  longFilePath: LongFilesPath | null,
): Finding[] {
  const files = new Set(plan.tasks.flatMap((task) => task.namedFiles));
  const findings: Finding[] = [];

  for (const file of files) {
    const finding = checkOneFile(root, plan, file, sizeLimit, longFilePath);
    if (finding) {
      findings.push(finding);
    }
  }

  return findings;
}

/**
 * Checks one distinct file named across the plan. Returns `null` for a file
 * that does not exist on disk, is not covered by `sizeLimit.patterns`, or is
 * within the limit - and for a file over the limit once its plan holds a
 * `long_files` path that clears it.
 */
function checkOneFile(
  root: string,
  plan: PlanTasks,
  file: string,
  sizeLimit: ProjectConfig["sizeLimit"],
  longFilePath: LongFilesPath | null,
): Finding | null {
  const absolute = path.join(root, file);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    return null;
  }
  if (!isCovered(file, sizeLimit.patterns)) {
    return null;
  }

  const count = countLines(readFileSync(absolute, "utf8"));
  if (count <= sizeLimit.max) {
    return null;
  }

  // Every distinct file came from at least one task's `namedFiles`, so a
  // first naming task always exists here.
  const firstTask = plan.tasks.find((task) => task.namedFiles.includes(file))!;

  if (longFilePath === null) {
    return makeFinding(
      firstTask.file || plan.file,
      firstTask.line,
      "long-file-without-path",
      `\`${file}\` is ${count} lines, over the limit of ${sizeLimit.max}. Record which path ` +
        "the change follows in .lexforge.yaml: `long_files: refactor` to bring the file back " +
        "under the limit, or `long_files: keep` to let it stay over as long as it does not grow.",
    );
  }

  if (longFilePath === "refactor" && !firstTask.declaresMove) {
    const taskName = firstTask.number || `the task at line ${firstTask.line}`;
    return makeFinding(
      firstTask.file || plan.file,
      firstTask.line,
      "long-file-not-split-first",
      `\`${file}\` is over the limit of ${sizeLimit.max} lines and its first task, ${taskName}, ` +
        "does not split it. On the refactor path the split comes before other work on the file: " +
        "mark that task `(move)`.",
    );
  }

  return null;
}
