import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import path from "node:path";

import { UsageError } from "../../cli/errors.js";

/** Names of the subdirectories of `directory`, sorted; empty when it is absent. */
function subdirectories(directory: string): string[] {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function changeStores(root: string, change: string): string[] {
  return subdirectories(path.join(root, "lexforge", "changes", change, "data"));
}

function migrationName(change: string, date: string): string {
  return `${date}-${change}`;
}

/**
 * A migration directory already standing under the name of this archiving is
 * what a run that broke off halfway leaves behind. The check runs before any
 * file is written, so a refusal leaves the workspace as it was.
 */
export function assertDataFree(root: string, change: string, date: string): void {
  for (const store of changeStores(root, change)) {
    const target = path.join(root, "lexforge", "data", store, migrationName(change, date));
    if (!existsSync(target)) continue;

    const shown = path.relative(root, target).split(path.sep).join("/");

    throw new UsageError(
      "archive-path-taken",
      `${shown} already exists. A change is archived under that name once, and ` +
        "what stands there now is left for a person to read.",
      `read ${shown}, move or remove it by hand, then run this command again`,
    );
  }
}

/**
 * Carries the data files of the change into the project. For each store the
 * schema, schema.sql or schema.md, replaces the project schema of that store
 * and removes the other of those two names; up.sql, down.sql, up.md and
 * down.md move into the migration directory; each services/<service>/service.md
 * is copied.
 */
export function moveDataAndServices(root: string, change: string, date: string): void {
  const changeDir = path.join(root, "lexforge", "changes", change);

  for (const store of changeStores(root, change)) {
    const from = path.join(changeDir, "data", store);
    const into = path.join(root, "lexforge", "data", store);
    const migration = path.join(into, migrationName(change, date));
    const files = readdirSync(from, { withFileTypes: true }).filter((entry) => entry.isFile());

    const names = new Set(files.map((file) => file.name));
    const schema = ["schema.sql", "schema.md"].find((name) => names.has(name));
    if (schema) {
      const other = schema === "schema.sql" ? "schema.md" : "schema.sql";
      mkdirSync(into, { recursive: true });
      rmSync(path.join(into, other), { force: true });
      copyFileSync(path.join(from, schema), path.join(into, schema));
    }

    const steps = ["up.sql", "down.sql", "up.md", "down.md"];
    for (const name of steps.filter((step) => names.has(step))) {
      mkdirSync(migration, { recursive: true });
      renameSync(path.join(from, name), path.join(migration, name));
    }
  }

  for (const service of subdirectories(path.join(changeDir, "services"))) {
    const source = path.join(changeDir, "services", service, "service.md");
    if (!existsSync(source)) continue;

    const target = path.join(root, "lexforge", "services", service, "service.md");
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
}
