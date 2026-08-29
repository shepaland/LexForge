import type { SchemaDefinition } from "../schemas/definition.js";
import type { OutputKind } from "../schemas/output-target.js";
import { resolveOutputPath } from "./resolve-path.js";

export type ArtifactStatus = "done" | "skipped" | "ready" | "blocked";

export interface ArtifactState {
  id: string;
  description: string;
  status: ArtifactStatus;
  requires: string[];
  /** Direct dependencies that are neither `done` nor `skipped`. Nothing transitive. */
  blockedBy: string[];
  resolvedOutputPath: string;
  outputKind: OutputKind;
}

export interface ChangeState {
  artifacts: ArtifactState[];
  /** True when every artifact of the schema is `done` or `skipped`. */
  isPlanningComplete: boolean;
}

export interface ComputeChangeStateInput {
  schema: SchemaDefinition;
  changeDir: string;
  /** Artifact id to "is it written on disk". A missing id counts as not written. */
  filled: Record<string, boolean>;
  skippedArtifacts?: string[];
}

/**
 * Two passes, no recursion. The first answers "written or skipped" for every
 * artifact, the second turns that into a status through `requires`. A cycle is
 * impossible here: the schema loader rejects one.
 */
export function computeChangeState(input: ComputeChangeStateInput): ChangeState {
  const skipped = new Set(input.skippedArtifacts ?? []);

  const closed = new Map<string, ArtifactStatus | null>();
  for (const artifact of input.schema.artifacts) {
    if (skipped.has(artifact.id)) {
      closed.set(artifact.id, "skipped");
    } else if (input.filled[artifact.id] === true) {
      closed.set(artifact.id, "done");
    } else {
      closed.set(artifact.id, null);
    }
  }

  const artifacts = input.schema.artifacts.map((artifact): ArtifactState => {
    const settled = closed.get(artifact.id) ?? null;
    const open = artifact.requires.filter((id) => closed.get(id) == null);
    const resolved = resolveOutputPath(input.changeDir, artifact.generates);

    return {
      id: artifact.id,
      description: artifact.description,
      status: settled ?? (open.length === 0 ? "ready" : "blocked"),
      requires: artifact.requires,
      blockedBy: settled === null ? open : [],
      resolvedOutputPath: resolved.resolvedOutputPath,
      outputKind: resolved.outputKind,
    };
  });

  const isPlanningComplete = artifacts.every(
    (artifact) => artifact.status === "done" || artifact.status === "skipped",
  );

  return { artifacts, isPlanningComplete };
}
