import { existsSync, readdirSync } from "node:fs";

import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { UsageError } from "../../cli/errors.js";
import { readTextFile } from "../read-text.js";
import { loadSchema } from "../schemas/load-schema.js";
import { CHANGE_CONFIG_FILE, workspacePaths } from "./paths.js";

const ChangeConfigSchema = z.object({
  schema: z.string(),
});

const SKIP_KEY = /^skip_(.+)$/;

export interface ChangeConfig {
  name: string;
  schema: string;
  /** Artifact ids declared as skipped through `skip_<artifact id>: true`. */
  skippedArtifacts: string[];
}

/** Change directories under `lexforge/changes/`, `archive/` aside, alphabetically. */
export function listActiveChanges(root: string): string[] {
  const dir = workspacePaths(root).changes;
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "archive")
    .map((entry) => entry.name)
    .sort();
}

export function readChangeConfig(root: string, name: string): ChangeConfig {
  const paths = workspacePaths(root);
  const file = paths.changeConfig(name);

  if (!existsSync(paths.changeDir(name))) {
    const active = listActiveChanges(root);
    throw new UsageError(
      "change-not-found",
      `there is no change named "${name}". ` +
        (active.length > 0
          ? `Active changes: ${active.join(", ")}.`
          : "There are no active changes."),
      active.length > 0 ? "" : "lexforge new change <name>",
    );
  }

  if (!existsSync(file)) {
    throw new UsageError(
      "change-config-invalid",
      `change "${name}" has no ${CHANGE_CONFIG_FILE}. Expected file: ${file}`,
    );
  }

  const raw = (parseYaml(readTextFile(file)) ?? {}) as Record<string, unknown>;
  const parsed = ChangeConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new UsageError(
      "change-config-invalid",
      `${file} is broken: the field "schema" is required.`,
    );
  }

  const artifactIds = loadSchema(parsed.data.schema).artifacts.map((artifact) => artifact.id);
  const skippedArtifacts: string[] = [];

  for (const [key, value] of Object.entries(raw)) {
    const match = SKIP_KEY.exec(key);
    if (!match) {
      continue;
    }

    const id = match[1]!;
    if (!artifactIds.includes(id)) {
      throw new UsageError(
        "change-config-invalid",
        `${file}: "${key}" names an artifact that schema "${parsed.data.schema}" does not have. ` +
          `Its artifacts are: ${artifactIds.join(", ")}.`,
      );
    }

    if (value === true) {
      skippedArtifacts.push(id);
    }
  }

  return { name, schema: parsed.data.schema, skippedArtifacts };
}
