import { readFileSync } from "node:fs";
import path from "node:path";

import { UsageError } from "../../cli/errors.js";
import type { ArtifactStatus } from "../artifact-graph/graph.js";
import { builtinSchemasDir, loadSchema } from "../schemas/load-schema.js";
import type { OutputKind } from "../schemas/output-target.js";
import { readChangeState } from "../status/change-status.js";
import type { CommandResult } from "../types.js";
import { findWorkspaceRoot } from "../workspace/find-root.js";
import { readProjectConfig } from "../workspace/project-config.js";

export interface ArtifactInstructionsOptions {
  /** Any directory inside the project; the workspace root is looked up from it. */
  cwd: string;
  change: string;
  artifact: string;
}

export interface InstructionsArtifact {
  id: string;
  description: string;
  status: ArtifactStatus;
}

export interface InstructionsDependency {
  id: string;
  status: ArtifactStatus;
  resolvedOutputPath: string;
}

export interface ArtifactInstructionsData {
  outputVersion: 1;
  workspaceRoot: string;
  change: string;
  schema: string;
  artifact: InstructionsArtifact;
  instruction: string;
  template: string;
  context: string;
  rules: string[];
  language: string;
  languageExplicit: boolean;
  dependencies: InstructionsDependency[];
  /** Direct dependencies that are still open. Empty for an artifact that can be written. */
  blockedBy: string[];
  resolvedOutputPath: string;
  outputKind: OutputKind;
  nextStep: string;
}

/** Everything the writer of one artifact needs: instruction, template, context, path. */
export function artifactInstructions(
  options: ArtifactInstructionsOptions,
): CommandResult<ArtifactInstructionsData> {
  const root = findWorkspaceRoot(options.cwd);
  const { schema: schemaName, state } = readChangeState(root, options.change);
  const schema = loadSchema(schemaName);

  const definition = schema.artifacts.find((entry) => entry.id === options.artifact);
  if (!definition) {
    const known = schema.artifacts.map((entry) => entry.id);
    throw new UsageError(
      "artifact-unknown",
      `schema "${schemaName}" has no artifact named "${options.artifact}". ` +
        `Its artifacts are: ${known.join(", ")}.`,
      `lexforge instructions ${known[0]} --change ${options.change}`,
    );
  }

  const artifactState = state.artifacts.find((entry) => entry.id === options.artifact)!;
  const project = readProjectConfig(root);

  // A blocked artifact gets neither instruction nor template: handing them over
  // with exit code `1` would turn the gate into a suggestion.
  const blocked = artifactState.status === "blocked";
  const blockedBy = artifactState.blockedBy;
  const nextStep = blocked
    ? `lexforge instructions ${blockedBy[0]} --change ${options.change}`
    : `lexforge validate ${options.change} --strict`;

  // Only the direct `requires`, in the order the schema names them: what sits
  // behind them matters for the status, not for the reader of this answer.
  const dependencies = artifactState.requires.map((id): InstructionsDependency => {
    const required = state.artifacts.find((entry) => entry.id === id)!;
    return {
      id: required.id,
      status: required.status,
      resolvedOutputPath: required.resolvedOutputPath,
    };
  });

  const data: ArtifactInstructionsData = {
    outputVersion: 1,
    workspaceRoot: root,
    change: options.change,
    schema: schemaName,
    artifact: {
      id: artifactState.id,
      description: artifactState.description,
      status: artifactState.status,
    },
    instruction: blocked ? "" : definition.instruction,
    template: blocked ? "" : readTemplate(schemaName, definition.template),
    context: project.context,
    rules: project.rules[definition.id] ?? [],
    language: project.language,
    languageExplicit: project.languageExplicit,
    dependencies,
    blockedBy,
    resolvedOutputPath: artifactState.resolvedOutputPath,
    outputKind: artifactState.outputKind,
    nextStep,
  };

  return { data, lines: renderLines(data), nextStep, exitCode: blocked ? 1 : 0 };
}

/** Template files sit next to the schema description they belong to. */
function readTemplate(schemaName: string, template: string): string {
  return readFileSync(path.join(builtinSchemasDir(), schemaName, template), "utf8");
}

function renderLines(data: ArtifactInstructionsData): string[] {
  if (data.blockedBy.length > 0) {
    return [
      `Artifact "${data.artifact.id}" of change "${data.change}" is not ready to be written.`,
      `Write these first: ${data.blockedBy.join(", ")}.`,
    ];
  }

  const lines = [
    `Artifact "${data.artifact.id}" of change "${data.change}": ${data.artifact.description}.`,
    `Write it to: ${data.resolvedOutputPath}`,
    "",
    data.instruction.trimEnd(),
  ];

  if (data.context !== "") {
    lines.push("", "Project context:", data.context.trimEnd());
  }

  if (data.rules.length > 0) {
    lines.push("", "Project rules for this artifact:", ...data.rules.map((rule) => `- ${rule}`));
  }

  if (data.dependencies.length > 0) {
    lines.push(
      "",
      "Read these first:",
      ...data.dependencies.map(
        (entry) => `- ${entry.id} (${entry.status}): ${entry.resolvedOutputPath}`,
      ),
    );
  }

  lines.push("", "Template:", data.template.trimEnd());

  return lines;
}
