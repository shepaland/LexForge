import {
  computeChangeState,
  type ArtifactState,
  type ChangeState,
} from "../artifact-graph/graph.js";
import { probeFilled } from "../artifact-graph/probe-filled.js";
import { nextStepForChange } from "../next-step.js";
import { loadSchema } from "../schemas/load-schema.js";
import type { CommandResult } from "../types.js";
import { readChangeConfig } from "../workspace/change-config.js";
import { findWorkspaceRoot } from "../workspace/find-root.js";
import { workspacePaths } from "../workspace/paths.js";

export interface ChangeStatusOptions {
  /** Any directory inside the project; the workspace root is looked up from it. */
  cwd: string;
  change: string;
}

export interface ChangeStatusData {
  outputVersion: 1;
  workspaceRoot: string;
  change: string;
  schema: string;
  isPlanningComplete: boolean;
  artifacts: ArtifactState[];
  nextStep: string;
}

export interface ReadChangeState {
  schema: string;
  state: ChangeState;
}

/** Reads the change from disk and turns what is there into artifact statuses. */
export function readChangeState(root: string, change: string): ReadChangeState {
  const config = readChangeConfig(root, change);
  const schema = loadSchema(config.schema);
  const changeDir = workspacePaths(root).changeDir(change);

  const filled: Record<string, boolean> = {};
  for (const artifact of schema.artifacts) {
    filled[artifact.id] = probeFilled(changeDir, artifact.generates);
  }

  return {
    schema: config.schema,
    state: computeChangeState({
      schema,
      changeDir,
      filled,
      skippedArtifacts: config.skippedArtifacts,
    }),
  };
}

/** State of one change: what is written, what can be written now, what is closed. */
export function changeStatus(options: ChangeStatusOptions): CommandResult<ChangeStatusData> {
  const root = findWorkspaceRoot(options.cwd);
  const { schema, state } = readChangeState(root, options.change);

  const nextStep = nextStepForChange(options.change, state);

  const data: ChangeStatusData = {
    outputVersion: 1,
    workspaceRoot: root,
    change: options.change,
    schema,
    isPlanningComplete: state.isPlanningComplete,
    artifacts: state.artifacts,
    nextStep,
  };

  return { data, lines: renderLines(data), nextStep, exitCode: 0 };
}

/** One line per artifact: `<id>  <status>`, plus the dependencies still open. */
function renderLines(data: ChangeStatusData): string[] {
  const width = Math.max(...data.artifacts.map((artifact) => artifact.id.length));

  const lines = [`Change "${data.change}" on schema "${data.schema}":`];
  for (const artifact of data.artifacts) {
    const blocked =
      artifact.blockedBy.length > 0 ? `  blocked by: ${artifact.blockedBy.join(", ")}` : "";
    lines.push(`  ${artifact.id.padEnd(width)}  ${artifact.status}${blocked}`);
  }

  if (data.isPlanningComplete) {
    lines.push("Planning is complete: every artifact is written or skipped.");
  }

  return lines;
}
