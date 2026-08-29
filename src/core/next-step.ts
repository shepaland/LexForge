import type { ChangeState } from "./artifact-graph/graph.js";

/** Said when the planning artifacts are all written or skipped. */
export const IMPLEMENT_STEP = "implement the change task by task, ticking each checkbox in tasks.md";

/** Said when the workspace holds no change to work on. */
export const NEW_CHANGE_STEP = "lexforge new change <name>";

/**
 * The command to run next on this change: instructions for the first artifact
 * that can be written now. A change that is not finished always has one, since
 * the schema loader rejects a cycle in `requires`.
 */
export function nextStepForChange(change: string, state: ChangeState): string {
  const ready = state.artifacts.find((artifact) => artifact.status === "ready");
  if (ready) {
    return `lexforge instructions ${ready.id} --change ${change}`;
  }

  return IMPLEMENT_STEP;
}
