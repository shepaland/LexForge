import { readFileSync } from "node:fs";

import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { UsageError } from "../../cli/errors.js";
import { workspacePaths } from "./paths.js";

export const DEFAULT_SCHEMA = "spec-driven";
export const DEFAULT_LANGUAGE = "en";

/**
 * A check label goes into the evidence record and into the command the hints
 * print, so its form is fixed: lowercase words joined by hyphens.
 */
export const VERIFICATION_LABEL = /^[a-z0-9]+(-[a-z0-9]+)*$/;

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

/** Unknown top-level sections are dropped, not rejected: config.yaml grows over time. */
const ProjectConfigSchema = z.object({
  schema: z.string().default(DEFAULT_SCHEMA),
  language: z.string().optional(),
  context: z.string().default(""),
  rules: z.record(z.string(), z.array(z.string())).default({}),
  verification: VerificationSchema,
  plan_placeholders: z.array(z.string()).default([]),
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
}

export function readProjectConfig(root: string): ProjectConfig {
  const file = workspacePaths(root).config;
  const raw = (parseYaml(readFileSync(file, "utf8")) ?? {}) as unknown;

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
  };
}
