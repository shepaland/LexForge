import { readFileSync } from "node:fs";

import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { UsageError } from "../../cli/errors.js";
import { workspacePaths } from "./paths.js";

export const DEFAULT_SCHEMA = "spec-driven";
export const DEFAULT_LANGUAGE = "en";

/** Unknown top-level sections are dropped, not rejected: config.yaml grows over time. */
const ProjectConfigSchema = z.object({
  schema: z.string().default(DEFAULT_SCHEMA),
  language: z.string().optional(),
  context: z.string().default(""),
  rules: z.record(z.string(), z.array(z.string())).default({}),
});

export interface ProjectConfig {
  schema: string;
  context: string;
  rules: Record<string, string[]>;
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
    language: result.data.language ?? DEFAULT_LANGUAGE,
    languageExplicit: explicit,
  };
}
