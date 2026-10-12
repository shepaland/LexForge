import { existsSync } from "node:fs";
import path from "node:path";

import { workspacePath } from "../answer-path.js";
import { checkMigration } from "../data/check-migration.js";
import { storeFormat, isStoreName, type StoreFormat } from "../data/dialects.js";
import { readMarkdownSchema, readMarkdownStep } from "../data/read-markdown.js";
import { readSql } from "../data/read-sql.js";
import { applyOperations, emptySchema, type Operation } from "../data/schema-model.js";
import { readTextFile } from "../read-text.js";
import { workspacePaths } from "../workspace/paths.js";
import type { ProjectConfig } from "../workspace/project-config.js";
import { makeFinding, oneLine, type Finding } from "./finding.js";
import { collectMarkers } from "./spec-markers.js";

const DATA_LINE = /^\s*Data:\s*(.*?)\s*$/;
const FILES = ["schema", "up", "down"] as const;

interface DataMarker {
  file: string;
  line: number;
  requirement: string;
  stores: string[];
}

/** Every `Data:` line of an ADDED or MODIFIED requirement, with the stores it names. */
function collectDataMarkers(root: string, specsDir: string): DataMarker[] {
  return collectMarkers(root, specsDir, DATA_LINE).map(({ value, ...rest }) => ({
    ...rest,
    stores: value.split(",").map((name) => name.trim()).filter((name) => name !== ""),
  }));
}

function isLowerDialect(dialect: string): boolean {
  return dialect === dialect.toLowerCase();
}

function checkConfigStores(configFile: string, config: ProjectConfig): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const { name, dialect } of config.stores) {
    if (seen.has(name)) {
      findings.push(makeFinding(configFile, 1, "data-store-duplicate", `The store "${name}" is listed twice in data_stores. Keep one entry for it.`));
    }
    seen.add(name);
    if (!isStoreName(name)) {
      findings.push(makeFinding(configFile, 1, "data-store-name", `The store name "${name}" is not valid. Use lower-case letters, digits and single hyphens, such as main or user-events.`));
    }
    if (dialect.trim() === "") {
      findings.push(makeFinding(configFile, 1, "data-store-dialect", `The store "${name}" has an empty dialect. Write the dialect of the store, such as postgresql or mongodb.`));
    } else if (!isLowerDialect(dialect)) {
      findings.push(makeFinding(configFile, 1, "data-store-dialect", oneLine(`The store "${name}" has the dialect "${dialect}". Write the dialect in lower case, such as ${dialect.toLowerCase()}.`)));
    }
  }
  return findings;
}

function checkMarkers(markers: DataMarker[], config: ProjectConfig): { findings: Finding[]; named: string[] } {
  const findings: Finding[] = [];
  const named: string[] = [];
  const known = new Set(config.stores.map((store) => store.name));
  for (const marker of markers) {
    for (const store of marker.stores) {
      const where = `requirement "${marker.requirement}", line ${marker.line} of ${marker.file}`;
      if (config.stores.length === 0) {
        findings.push(makeFinding(marker.file, marker.line, "data-stores-missing", `The store "${store}" is named in ${where}, but data_stores is not set in lexforge/config.yaml. Add the store to data_stores.`));
      } else if (!known.has(store)) {
        findings.push(makeFinding(marker.file, marker.line, "data-store-unknown", `The store "${store}" is named in ${where}, but data_stores does not list it. Add it to data_stores or fix the name.`));
      } else if (isStoreName(store) && !named.includes(store)) {
        named.push(store);
      }
    }
  }
  return { findings, named };
}

function checkStoreFiles(root: string, dataDir: string, dataRoot: string, store: string, dialect: string): Finding[] {
  const findings: Finding[] = [];
  const format: StoreFormat = storeFormat(dialect);
  const ext = format === "sql" ? "sql" : "md";
  const other = format === "sql" ? "md" : "sql";
  const storeDir = path.join(dataDir, store);
  const shown = (name: string) => workspacePath(root, path.join(storeDir, name));
  const read: Partial<Record<(typeof FILES)[number], Operation[]>> = {};

  for (const base of FILES) {
    const name = `${base}.${ext}`;
    const file = path.join(storeDir, name);
    const wrong = path.join(storeDir, `${base}.${other}`);
    if (existsSync(wrong)) {
      findings.push(makeFinding(shown(`${base}.${other}`), 1, "data-file-format", `The store "${store}" is ${dialect}: ${shown(`${base}.${other}`)} is in the wrong format. Write ${name} instead.`));
    }
    if (!existsSync(file)) {
      findings.push(makeFinding(shown(name), 1, "data-file-missing", `The store "${store}" has no ${name}. Write ${shown(name)}.`));
      continue;
    }
    const checked = checkFile(shown(name), readTextFile(file), store, dialect, format, base);
    findings.push(...checked.findings);
    if (checked.operations) read[base] = checked.operations;
  }
  // Compare whenever the three files parsed, whatever other findings the store has.
  if (read.schema && read.up && read.down) {
    const project = readProjectSchema(root, dataRoot, store, dialect, format, findings);
    if (project !== undefined) {
      const input = { store, project, schema: read.schema, up: read.up, down: read.down, ext };
      for (const diff of checkMigration(input)) {
        findings.push(makeFinding(shown(diff.file), 1, `data-migration-${diff.step}`, oneLine(`${diff.message} Fix ${diff.file} or schema.${ext}.`)));
      }
    }
  }
  return findings;
}

/** The operations of the project schema of a store, null when it has none, undefined when it does not parse. */
function readProjectSchema(root: string, dataRoot: string, store: string, dialect: string, format: StoreFormat, findings: Finding[]): Operation[] | null | undefined {
  const file = path.join(dataRoot, store, `schema.${format === "sql" ? "sql" : "md"}`);
  if (!existsSync(file)) return null;
  const shown = workspacePath(root, file);
  const checked = checkFile(shown, readTextFile(file), store, dialect, format, "project");
  if (!checked.operations) {
    findings.push(...checked.findings);
    return undefined;
  }
  return checked.operations;
}

function checkFile(file: string, text: string, store: string, dialect: string, format: StoreFormat, base: string): { findings: Finding[]; operations?: Operation[] } {
  const findings: Finding[] = [];
  const bad = (line: number, why: string) =>
    findings.push(makeFinding(file, line, "data-file-parse", oneLine(`${file} does not parse for ${dialect}: ${why} Fix the file.`)));
  let operations;
  let parsed = true;
  if (format === "sql") {
    const read = readSql(text, dialect);
    if ("error" in read) {
      bad(1, read.error);
      return { findings };
    }
    operations = read.operations;
  } else {
    const read = base === "up" || base === "down" ? readMarkdownStep(text) : readMarkdownSchema(text);
    for (const error of read.errors) bad(error.line, error.message);
    parsed = read.errors.length === 0;
    operations = read.operations;
    if ("dataMigration" in read && !read.dataMigration) {
      const why = read.dataMigration === null ? "has no" : "has an empty";
      findings.push(makeFinding(file, 1, "data-migration-empty", `${file} ${why} "## Data migration" section. Write there what happens to the data, or why none moves.`));
    }
  }
  const result = parsed ? { findings, operations } : { findings };
  if (base !== "schema") return result;

  const built = applyOperations(emptySchema(), operations);
  for (const problem of built.problems) bad(1, problem.message);
  for (const table of built.schema.tables) {
    if (table.primaryKey.length === 0) {
      findings.push(makeFinding(file, 1, "data-table-no-primary-key", `The table ${table.name} of the store "${store}" in ${file} has no primary key. Add one.`));
    }
  }
  return result;
}

/**
 * The data checks of one change under strict mode: the stores of the project,
 * the stores a requirement names, and the schema and migration files of each.
 */
export function checkDataModel(root: string, change: string, config: ProjectConfig): Finding[] {
  const changeDir = workspacePaths(root).changeDir(change);
  const configFile = workspacePath(root, workspacePaths(root).config);
  const markers = collectDataMarkers(root, path.join(changeDir, "specs"));
  const checked = checkMarkers(markers, config);
  const findings = [...checkConfigStores(configFile, config), ...checked.findings];
  for (const store of checked.named) {
    const dialect = config.stores.find((item) => item.name === store)!.dialect;
    if (!isLowerDialect(dialect)) continue;
    findings.push(...checkStoreFiles(root, path.join(changeDir, "data"), path.join(workspacePaths(root).lexforge, "data"), store, dialect));
  }
  return findings;
}
