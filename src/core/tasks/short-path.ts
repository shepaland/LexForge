import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { UsageError } from "../../cli/errors.js";
import { collectMarkers } from "../validation/spec-markers.js";
import { validateChange } from "../validation/validate-change.js";
import { readChangeConfig } from "../workspace/change-config.js";
import { workspacePaths } from "../workspace/paths.js";
import { changeDir } from "./paths.js";
import { readChangePlan } from "./plan-ready.js";
import { readWorkflowFile } from "./workflow-file.js";

const DATA_LINE = /^\s*Data:\s*(.*?)\s*$/;

/** Whether the change runs on the short path. A change without workflow.json runs on the full path. */
export function isShortPath(root: string, change: string): boolean {
  if (!existsSync(path.join(root, changeDir(change), "workflow.json"))) return false;
  return readWorkflowFile(root, change).path === "short";
}

function escalateCommand(change: string): string {
  return `lexforge plan escalate --change ${change}`;
}

/** Capabilities the delta specs of the change add: a directory the project specs do not have. */
function newCapabilities(root: string, change: string): string[] {
  const paths = workspacePaths(root);
  const deltas = path.join(paths.changeDir(change), "specs");
  if (!existsSync(deltas)) return [];
  return readdirSync(deltas, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(deltas, entry.name, "spec.md")))
    .map((entry) => entry.name)
    .filter((name) => !existsSync(path.join(paths.specs, name)))
    .sort();
}

/** Why the change cannot stay on the short path, one line per reason. An empty list means it can. */
export function shortPathProblems(root: string, change: string): string[] {
  const problems: string[] = [];
  const tasks = readChangePlan(root, change).tasks.filter((task) => task.number !== "");
  if (tasks.length !== 1) {
    problems.push(`the plan has ${tasks.length} tasks, the short path allows one`);
  }
  for (const name of newCapabilities(root, change)) {
    problems.push(`delta specs/${name}/spec.md adds a capability the project does not have`);
  }
  const specs = path.join(workspacePaths(root).changeDir(change), "specs");
  const named = new Set<string>();
  for (const marker of collectMarkers(root, specs, DATA_LINE)) {
    if (named.has(marker.requirement)) continue;
    named.add(marker.requirement);
    problems.push(`requirement "${marker.requirement}" holds a Data: line`);
  }
  if (existsSync(path.join(workspacePaths(root).changeDir(change), "data"))) {
    problems.push("the change holds data/");
  }
  for (const task of tasks) {
    if (task.controls.includes("migrations")) problems.push(`task ${task.number} declares Controls: migrations`);
  }
  return problems;
}

/** Refuses a short change that outgrew the short path. */
export function assertShortPathEligible(root: string, change: string): void {
  const problems = shortPathProblems(root, change);
  if (problems.length > 0) {
    throw new UsageError(
      "short-path-not-eligible",
      `change "${change}" no longer fits the short path: ${problems.join("; ")}.`,
      escalateCommand(change),
    );
  }
}

/** Specs before code: the delta passes validate --strict, or the change carries skip_specs: true. */
export function assertSpecsBeforeCode(root: string, change: string): void {
  if (readChangeConfig(root, change).skippedArtifacts.includes("specs")) return;
  if (validateChange({ cwd: root, change, strict: true }).exitCode !== 0) {
    throw new UsageError(
      "specs-before-code",
      `the delta specs of change "${change}" have findings under the strict validation, so no red run is taken before they pass.`,
      `lexforge validate ${change} --strict`,
    );
  }
}

/** The checks a short change passes at every `task start` and `task red`. */
export function assertShortPathAdmission(root: string, change: string, verb: "start" | "red"): void {
  assertShortPathEligible(root, change);
  if (verb === "red") assertSpecsBeforeCode(root, change);
}
