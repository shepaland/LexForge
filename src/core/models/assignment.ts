import type { ModelAssignment } from "../workspace/project-config.js";

/**
 * Every stage of the pipeline, in the order a change passes through them. The
 * four planning artifacts are stages of their own; the last four are the loops
 * around the code, which write no artifact and appear in no schema.
 */
export const PIPELINE_STAGES = [
  "proposal",
  "specs",
  "design",
  "tasks",
  "apply",
  "debug",
  "verify",
  "archive",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/**
 * The one stage that demands no model: archival merges the delta into the
 * long-lived specs and runs on whichever model is at work. Exported because the
 * silence of archival and the silence of a project that named no model read the
 * same in an answer, and whoever prints them apart needs the name.
 */
export const STAGE_WITHOUT_MODEL: PipelineStage = "archive";

/** One stage of the pipeline with the model it resolves to. */
export interface StageAssignment {
  stage: string;
  /** Empty in a project with no assignment, and for the stage that demands none. */
  provider: string;
  model: string;
}

/**
 * Whether the pipeline demands a model for this stage. A name outside the list -
 * the artifact of a schema outside the two shipped ones, say - is no stage of
 * the pipeline and demands nothing.
 */
function demandsModel(stage: string): boolean {
  return (
    stage !== STAGE_WITHOUT_MODEL && (PIPELINE_STAGES as readonly string[]).includes(stage)
  );
}

/**
 * The model one stage runs on for the runtime the call comes from: the entry of
 * that runtime when the section holds one, the `default` otherwise. An entry
 * decides alone - the top level is not read for a runtime that has one - so a
 * runtime never inherits the model of another vendor. A call that names no
 * runtime, and a name the section does not hold, both read the top level.
 *
 * The catalogue is never consulted, so a name it does not hold is carried
 * through exactly as the config wrote it.
 */
export function resolveStage(
  models: ModelAssignment,
  stage: string,
  tool = "",
): StageAssignment {
  if (!demandsModel(stage)) {
    return { stage, provider: "", model: "" };
  }

  // `Object.hasOwn`, not a plain lookup: a runtime named `constructor` or
  // `toString` would otherwise find something on the object prototype and lose
  // the fallback the requirement gives it.
  const entry =
    tool !== "" && Object.hasOwn(models.tools, tool) ? models.tools[tool] : undefined;
  const choice = entry ?? models.default;

  return {
    stage,
    provider: choice?.provider ?? "",
    model: choice?.model ?? "",
  };
}

/** Every stage of the pipeline with its assignment, in the order of the table. */
export function resolveStages(models: ModelAssignment, tool = ""): StageAssignment[] {
  return PIPELINE_STAGES.map((stage) => resolveStage(models, stage, tool));
}
