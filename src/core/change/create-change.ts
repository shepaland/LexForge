import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";

import { UsageError } from "../../cli/errors.js";
import { loadSchema } from "../schemas/load-schema.js";
import type { CommandResult } from "../types.js";
import { findWorkspaceRoot } from "../workspace/find-root.js";
import { workspacePaths } from "../workspace/paths.js";
import { readProjectConfig } from "../workspace/project-config.js";
import { isKebabCase, toKebabCase } from "./kebab-case.js";

export interface CreateChangeOptions {
  /** Any directory inside the project; the workspace root is looked up from it. */
  cwd: string;
  name: string;
  /** Schema of this change. Without it the project default from config.yaml is used. */
  schema?: string;
}

export interface CreateChangeData {
  outputVersion: 1;
  workspaceRoot: string;
  change: string;
  schema: string;
  created: string[];
  nextStep: string;
}

export function createChange(options: CreateChangeOptions): CommandResult<CreateChangeData> {
  const root = findWorkspaceRoot(options.cwd);
  const paths = workspacePaths(root);
  const name = options.name;

  // Every check runs before the first write: a refused call leaves the
  // workspace exactly as it was.
  checkName(name);
  checkFree(paths.changeDir(name), paths.archive, name);

  const schemaName = options.schema ?? readProjectConfig(root).schema;
  const schema = loadSchema(schemaName);

  const changeDir = paths.changeDir(name);
  const configFile = paths.changeConfig(name);

  mkdirSync(changeDir, { recursive: true });
  writeFileSync(configFile, `schema: ${schemaName}\n`, "utf8");

  const first = schema.artifacts[0]!;
  const nextStep = `lexforge instructions ${first.id} --change ${name}`;

  const data: CreateChangeData = {
    outputVersion: 1,
    workspaceRoot: root,
    change: name,
    schema: schemaName,
    created: [changeDir, configFile],
    nextStep,
  };

  const lines = [
    `Created change "${name}" on schema "${schemaName}".`,
    ...data.created.map((entry) => `  ${entry}`),
  ];

  return { data, lines, nextStep, exitCode: 0 };
}

function checkName(name: string): void {
  if (isKebabCase(name)) {
    return;
  }

  const fixed = toKebabCase(name);
  throw new UsageError(
    "change-name-invalid",
    `"${name}" is not a change name. Use lowercase letters, digits and single dashes.` +
      (fixed.length > 0 ? ` Write it as "${fixed}".` : ""),
    fixed.length > 0 ? `lexforge new change ${fixed}` : "",
  );
}

/** An archived change keeps its name under a date prefix: `2026-01-01-add-auth`. */
const ARCHIVED_NAME = /^\d{4}-\d{2}-\d{2}-(.+)$/;

function checkFree(changeDir: string, archiveDir: string, name: string): void {
  if (existsSync(changeDir)) {
    throw new UsageError(
      "change-name-taken",
      `change "${name}" already exists: ${changeDir}. Pick another name.`,
    );
  }

  for (const entry of archivedNames(archiveDir)) {
    const archived = ARCHIVED_NAME.exec(entry)?.[1] ?? entry;
    if (archived === name) {
      throw new UsageError(
        "change-name-taken",
        `the name "${name}" belongs to an archived change: ${entry}. Pick another name.`,
      );
    }
  }
}

function archivedNames(archiveDir: string): string[] {
  try {
    return readdirSync(archiveDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}
