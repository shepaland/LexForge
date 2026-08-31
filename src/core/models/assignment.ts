import type { ModelAssignment, ModelChoice, ModelRole } from "../workspace/project-config.js";

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
 * Stage to role. The mapping is product behaviour fixed by the spec, identical
 * for every schema, and it covers the four stages no schema describes - which
 * is why it lives here and not in a schema file.
 */
const STAGE_ROLES: Record<PipelineStage, ModelRole | null> = {
  proposal: "analysis",
  specs: "analysis",
  design: "analysis",
  tasks: "analysis",
  apply: "development",
  debug: "development",
  verify: "review",
  archive: null,
};

/** One stage of the pipeline with the model it resolves to. */
export interface StageAssignment {
  stage: string;
  /** The role of the stage; empty for a stage that carries none. */
  role: string;
  /** Empty in a project with no assignment, and for a stage without a role. */
  provider: string;
  model: string;
}

/**
 * The role of one stage. A stage the table does not hold - the artifact of a
 * schema outside the two shipped ones, or a name off the object prototype -
 * carries no role, so the signature takes a plain string and the callers need
 * no cast to ask.
 */
export function stageRole(stage: string): ModelRole | null {
  return Object.hasOwn(STAGE_ROLES, stage)
    ? STAGE_ROLES[stage as PipelineStage]
    : null;
}

/**
 * The model one stage runs on: the override of its role when the config names
 * one, the `default` otherwise. The catalogue is never consulted, so a name it
 * does not hold is carried through exactly as the config wrote it.
 */
export function resolveStage(models: ModelAssignment, stage: string): StageAssignment {
  const role = stageRole(stage);

  if (role === null) {
    return { stage, role: "", provider: "", model: "" };
  }

  const choice: ModelChoice | null = models.roles[role] ?? models.default;

  return {
    stage,
    role,
    provider: choice?.provider ?? "",
    model: choice?.model ?? "",
  };
}

/** Every stage of the pipeline with its assignment, in the order of the table. */
export function resolveStages(models: ModelAssignment): StageAssignment[] {
  return PIPELINE_STAGES.map((stage) => resolveStage(models, stage));
}
