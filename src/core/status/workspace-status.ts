import { NEW_CHANGE_STEP, nextStepForChange } from "../next-step.js";
import type { CommandResult } from "../types.js";
import { listActiveChanges } from "../workspace/change-config.js";
import { findWorkspaceRoot } from "../workspace/find-root.js";
import { readChangeState } from "./change-status.js";

export interface WorkspaceStatusOptions {
  /** Any directory inside the project; the workspace root is looked up from it. */
  cwd: string;
}

export interface ChangeSummary {
  name: string;
  schema: string;
  /** Artifacts already closed: written or declared skipped. */
  artifactsDone: number;
  artifactsTotal: number;
  isPlanningComplete: boolean;
}

export interface WorkspaceStatusData {
  outputVersion: 1;
  workspaceRoot: string;
  changes: ChangeSummary[];
  nextStep: string;
}

/** Every change that is not archived, with its schema and how much of it is written. */
export function workspaceStatus(
  options: WorkspaceStatusOptions,
): CommandResult<WorkspaceStatusData> {
  const root = findWorkspaceRoot(options.cwd);

  const changes: ChangeSummary[] = [];
  let nextStep = "";

  for (const name of listActiveChanges(root)) {
    const { schema, state } = readChangeState(root, name);

    changes.push({
      name,
      schema,
      artifactsDone: state.artifacts.filter(
        (artifact) => artifact.status === "done" || artifact.status === "skipped",
      ).length,
      artifactsTotal: state.artifacts.length,
      isPlanningComplete: state.isPlanningComplete,
    });

    if (nextStep === "" && !state.isPlanningComplete) {
      nextStep = nextStepForChange(name, state);
    }
  }

  const data: WorkspaceStatusData = {
    outputVersion: 1,
    workspaceRoot: root,
    changes,
    nextStep: nextStep === "" ? NEW_CHANGE_STEP : nextStep,
  };

  return { data, lines: renderLines(data), nextStep: data.nextStep, exitCode: 0 };
}

/** One line per change: `<name>  <schema>  <done>/<total>`. */
function renderLines(data: WorkspaceStatusData): string[] {
  if (data.changes.length === 0) {
    return ["There are no active changes in this workspace."];
  }

  const width = Math.max(1, ...data.changes.map((change) => change.name.length));

  return [
    "Active changes:",
    ...data.changes.map(
      (change) =>
        `  ${change.name.padEnd(width)}  ${change.schema}  ` +
        `${change.artifactsDone}/${change.artifactsTotal} artifacts written`,
    ),
  ];
}
