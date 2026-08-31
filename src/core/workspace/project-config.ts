import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { UsageError } from "../../cli/errors.js";
import { readTextFile } from "../read-text.js";
import { workspacePaths } from "./paths.js";

export const DEFAULT_SCHEMA = "spec-driven";
export const DEFAULT_LANGUAGE = "en";

/**
 * A check label goes into the evidence record and into the command the hints
 * print, so its form is fixed: lowercase words joined by hyphens.
 */
export const VERIFICATION_LABEL = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The three roles a stage of the pipeline runs under. */
export const MODEL_ROLES = ["analysis", "development", "review"] as const;

export type ModelRole = (typeof MODEL_ROLES)[number];

/** One provider and one model of that provider, as the config names them. */
export interface ModelChoice {
  provider: string;
  model: string;
}

/** The `models` section, read into the shape the pipeline resolves against. */
export interface ModelAssignment {
  /** The model every unnamed role falls back to; `null` in a project without the section. */
  default: ModelChoice | null;
  /** Overrides written for a role. A role left out resolves to the `default`. */
  roles: Partial<Record<ModelRole, ModelChoice>>;
  /** Provider name to the model names of that provider. Never checked against. */
  providers: Record<string, string[]>;
}

/**
 * Checks every label of the `verification` section. The check sits here rather
 * than on the record key, because a key rejected by the key schema is reported
 * as "invalid key" and the reader is left guessing what a label looks like.
 */
const VerificationSchema = z
  .record(z.string(), z.string())
  .superRefine((section, ctx) => {
    for (const label of Object.keys(section)) {
      if (VERIFICATION_LABEL.test(label)) {
        continue;
      }

      ctx.addIssue({
        code: "custom",
        path: [label],
        message:
          `"${label}" is not a check label. Write it in lowercase letters, digits ` +
          "and hyphens, such as unit-tests.",
      });
    }
  })
  .default({});

/**
 * One provider and one model of it, used for the `default` and for every role.
 * The message spells the shape out, because the default "expected object,
 * received string" leaves the reader guessing what the mapping holds.
 */
const ModelChoiceSchema = z.object(
  {
    provider: z.string(),
    model: z.string(),
  },
  {
    error:
      "write it as a mapping of a provider and a model, " +
      "such as provider: anthropic and model: claude-opus-5",
  },
);

/**
 * The `models` section: the `default`, the three role overrides and the
 * catalogue. An incomplete section is not refused - a half-written assignment
 * resolves through the `default` rather than stopping a pipeline that ran a
 * minute ago.
 */
const ModelsSchema = z
  .object({
    default: ModelChoiceSchema.optional(),
    analysis: ModelChoiceSchema.optional(),
    development: ModelChoiceSchema.optional(),
    review: ModelChoiceSchema.optional(),
    providers: z.record(z.string(), z.array(z.string())).default({}),
  })
  // `nullish`, not `optional`: YAML reads a bare `models:` header as null, and a
  // section header with nothing under it is the extreme of incomplete, which the
  // requirement forbids refusing.
  .nullish();

/** Unknown top-level sections are dropped, not rejected: config.yaml grows over time. */
const ProjectConfigSchema = z.object({
  schema: z.string().default(DEFAULT_SCHEMA),
  language: z.string().optional(),
  context: z.string().default(""),
  rules: z.record(z.string(), z.array(z.string())).default({}),
  verification: VerificationSchema,
  plan_placeholders: z.array(z.string()).default([]),
  models: ModelsSchema,
});

export interface ProjectConfig {
  schema: string;
  context: string;
  rules: Record<string, string[]>;
  /** Named checks: a label and the one command that runs it. */
  verification: Record<string, string>;
  /** Extra placeholder markers of this project, added to the built-in list. */
  planPlaceholders: string[];
  language: string;
  /** True when `language` is written in config.yaml, so the choice was made on purpose. */
  languageExplicit: boolean;
  /** The model assignment of this project. Empty in a project without the section. */
  models: ModelAssignment;
}

export function readProjectConfig(root: string): ProjectConfig {
  const file = workspacePaths(root).config;
  const raw = (parseYaml(readTextFile(file)) ?? {}) as unknown;

  const result = ProjectConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("; ");
    throw new UsageError("project-config-invalid", `${file} is broken: ${issues}`);
  }

  const explicit =
    typeof raw === "object" && raw !== null && "language" in (raw as Record<string, unknown>);

  return {
    schema: result.data.schema,
    context: result.data.context,
    rules: result.data.rules,
    verification: result.data.verification,
    planPlaceholders: result.data.plan_placeholders,
    language: result.data.language ?? DEFAULT_LANGUAGE,
    languageExplicit: explicit,
    models: toAssignment(result.data.models),
  };
}

/** The parsed section as the pipeline reads it; an absent section is an empty assignment. */
function toAssignment(section: z.infer<typeof ModelsSchema>): ModelAssignment {
  if (!section) {
    return { default: null, roles: {}, providers: {} };
  }

  const roles: Partial<Record<ModelRole, ModelChoice>> = {};
  for (const role of MODEL_ROLES) {
    const choice = section[role];
    if (choice) {
      roles[role] = choice;
    }
  }

  return {
    default: section.default ?? null,
    roles,
    providers: section.providers,
  };
}
