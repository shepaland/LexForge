import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

import { UsageError } from "../../cli/errors.js";
import { answerPath } from "../answer-path.js";
import { SchemaDefinitionSchema, type SchemaDefinition } from "./definition.js";
import { parseOutputTarget } from "./output-target.js";

/** `schemas/` sits next to `src/` and `dist/`, three levels above this module. */
export function builtinSchemasDir(): string {
  return fileURLToPath(new URL("../../../schemas", import.meta.url));
}

const cache = new Map<string, SchemaDefinition>();

/** Every directory holding a `schema.yaml`, in alphabetical order. */
export function listSchemaNames(schemasDir: string = builtinSchemasDir()): string[] {
  const root = path.resolve(schemasDir);
  if (!existsSync(root)) {
    return [];
  }

  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(path.join(root, name, "schema.yaml")))
    .sort();
}

export function loadSchema(
  name: string,
  schemasDir: string = builtinSchemasDir(),
): SchemaDefinition {
  const root = path.resolve(schemasDir);
  const key = `${root} ${name}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const schemaDir = path.join(root, name);
  const file = path.join(schemaDir, "schema.yaml");

  if (!existsSync(file)) {
    throw new UsageError(
      "schema-unknown",
      `there is no schema named "${name}". Available schemas: ${listSchemaNames(root).join(", ")}.`,
    );
  }

  const definition = parseDefinition(name, file);
  checkDefinition(name, definition, schemaDir);

  cache.set(key, definition);
  return definition;
}

function parseDefinition(name: string, file: string): SchemaDefinition {
  const result = SchemaDefinitionSchema.safeParse(parseYaml(readFileSync(file, "utf8")));
  if (result.success) {
    return result.data;
  }

  const issues = result.error.issues
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("; ");
  throw new UsageError("schema-invalid", `schema "${name}" in ${file} is broken: ${issues}`);
}

function checkDefinition(name: string, definition: SchemaDefinition, schemaDir: string): void {
  const ids = new Set<string>();
  for (const artifact of definition.artifacts) {
    if (ids.has(artifact.id)) {
      throw new UsageError(
        "schema-invalid",
        `schema "${name}" declares the artifact "${artifact.id}" twice. Every id must be unique.`,
      );
    }
    ids.add(artifact.id);
  }

  for (const artifact of definition.artifacts) {
    parseOutputTarget(artifact.generates);

    for (const required of artifact.requires) {
      if (!ids.has(required)) {
        throw new UsageError(
          "schema-invalid",
          `schema "${name}": artifact "${artifact.id}" requires "${required}", ` +
            `which is not in the schema. Known artifacts: ${[...ids].join(", ")}.`,
        );
      }
    }

    const template = path.join(schemaDir, artifact.template);
    if (!existsSync(template)) {
      throw new UsageError(
        "schema-invalid",
        `schema "${name}": artifact "${artifact.id}" points at a template that is not on disk. ` +
          `Expected file: ${answerPath(template)}`,
      );
    }
  }

  checkNoCycle(name, definition);
}

/** Kahn's algorithm: whatever is left after the sweep sits on a cycle. */
function checkNoCycle(name: string, definition: SchemaDefinition): void {
  const pending = new Map<string, Set<string>>();
  for (const artifact of definition.artifacts) {
    pending.set(artifact.id, new Set(artifact.requires));
  }

  let removed = true;
  while (removed) {
    removed = false;
    for (const [id, requires] of pending) {
      if (requires.size === 0) {
        pending.delete(id);
        for (const rest of pending.values()) {
          rest.delete(id);
        }
        removed = true;
      }
    }
  }

  if (pending.size > 0) {
    throw new UsageError(
      "schema-invalid",
      `schema "${name}" has a cycle in requires. Artifacts on the cycle: ${[...pending.keys()].join(", ")}.`,
    );
  }
}
