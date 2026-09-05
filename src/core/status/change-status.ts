import {
  computeChangeState,
  type ArtifactState,
  type ChangeState,
} from "../artifact-graph/graph.js";
import { answerPath } from "../answer-path.js";
import { probeFilled } from "../artifact-graph/probe-filled.js";
import {
  resolveStage,
  resolveStages,
  STAGE_WITHOUT_MODEL,
  type StageAssignment,
} from "../models/assignment.js";
import { nextStepForChange } from "../next-step.js";
import { loadSchema } from "../schemas/load-schema.js";
import type { CommandResult } from "../types.js";
import { readChangeConfig } from "../workspace/change-config.js";
import { findWorkspaceRoot } from "../workspace/find-root.js";
import { workspacePaths } from "../workspace/paths.js";
import { readProjectConfig } from "../workspace/project-config.js";

export interface ChangeStatusOptions {
  /** Any directory inside the project; the workspace root is looked up from it. */
  cwd: string;
  change: string;
  /** The runtime the call comes from; empty when the caller names none. */
  tool?: string;
}

/** An artifact of the change with the model its stage resolves to. */
export interface StatusArtifact extends ArtifactState {
  /** The model of the calling runtime. Empty in a project with no assignment. */
  model: string;
}

export interface ChangeStatusData {
  outputVersion: 1;
  workspaceRoot: string;
  change: string;
  schema: string;
  isPlanningComplete: boolean;
  artifacts: StatusArtifact[];
  /**
   * Every stage of the pipeline with its assignment, the four that write no
   * artifact included: a skill that owns no artifact reads its own model here.
   */
  stages: StageAssignment[];
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
  const models = readProjectConfig(root).models;

  const tool = options.tool ?? "";

  const nextStep = nextStepForChange(options.change, state);

  const data: ChangeStatusData = {
    outputVersion: 1,
    workspaceRoot: answerPath(root),
    change: options.change,
    schema,
    isPlanningComplete: state.isPlanningComplete,
    artifacts: state.artifacts.map((artifact) => {
      const assignment = resolveStage(models, artifact.id, tool);

      return {
        ...artifact,
        resolvedOutputPath: answerPath(artifact.resolvedOutputPath),
        model: assignment.model,
      };
    }),
    stages: resolveStages(models, tool),
    nextStep,
  };

  return { data, lines: renderLines(data), nextStep, exitCode: 0 };
}

/**
 * One line per artifact: `<id>  <status>`, the model of that artifact when the
 * project names one, plus the dependencies still open. A project with no
 * assignment prints what it printed before the models section existed.
 */
function renderLines(data: ChangeStatusData): string[] {
  const width = Math.max(...data.artifacts.map((artifact) => artifact.id.length));
  const statusWidth = Math.max(...data.artifacts.map((artifact) => artifact.status.length));

  const lines = [`Change "${data.change}" on schema "${data.schema}":`];
  for (const artifact of data.artifacts) {
    const blocked =
      artifact.blockedBy.length > 0 ? `  blocked by: ${artifact.blockedBy.join(", ")}` : "";
    const status = artifact.model === "" ? artifact.status : artifact.status.padEnd(statusWidth);
    const model = artifact.model === "" ? "" : `  ${artifact.model}`;
    lines.push(`  ${artifact.id.padEnd(width)}  ${status}${model}${blocked}`);
  }

  lines.push(...stageLines(data.stages, new Set(data.artifacts.map((artifact) => artifact.id))));

  if (data.isPlanningComplete) {
    lines.push("Planning is complete: every artifact is written or skipped.");
  }

  return lines;
}

/**
 * The stages this change writes no artifact for. Which stages those are comes
 * from the change itself, not from a list written out here: a schema with three
 * artifacts leaves the fourth stage to this block, and a list of its own would
 * swallow it. The block is printed only where the project names models at all:
 * without an assignment it would name four stages and say nothing about any.
 */
function stageLines(stages: StageAssignment[], written: Set<string>): string[] {
  if (!stages.some((stage) => stage.model !== "")) {
    return [];
  }

  const rest = stages.filter((stage) => !written.has(stage.stage));
  if (rest.length === 0) {
    return [];
  }

  const width = Math.max(...rest.map((stage) => stage.stage.length));

  return [
    "Stages without an artifact:",
    ...rest.map((stage) => {
      // The block is printed only where the project names a model, and with
      // the roles gone that model belongs to every stage but archival. So the
      // one silence left is archival's, and it is told by the stage name.
      return stage.stage === STAGE_WITHOUT_MODEL
        ? `  ${stage.stage.padEnd(width)}  no model demanded`
        : `  ${stage.stage.padEnd(width)}  ${stage.model}`;
    }),
  ];
}
