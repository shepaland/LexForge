import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { UsageError } from "../../cli/errors.js";
import { listActiveChanges } from "../workspace/change-config.js";
import { workspacePaths } from "../workspace/paths.js";
import { saveText } from "./files.js";
import { withChangeLock } from "./lock.js";
import { changeDir } from "./paths.js";
import { reviewCommand } from "./plan-state.js";
import { writeWorkflowFile } from "./workflow-file.js";

/** Keys 6.0.0 no longer reads, by file. */
const CONFIG_KEYS = ["file_limit"];
const CHANGE_KEYS = ["long_files"];

/** Where the files of the 5.x execution engine are put aside. */
const ASIDE = "execution-5x";
/** Files of the 5.x engine at the top of the change directory. */
const OLD_FILES = ["execution-plan.json", "red-runs.json"];

export type MissingField = "Files" | "Test" | "Command";

export interface MigrationResult {
  change: string;
  closed: string[];
  reopened: string[];
  open: string[];
  missingFields: Array<{ task: string; fields: MissingField[] }>;
  approved: boolean;
  nextStep: string;
}

/**
 * Takes top-level keys out of a YAML text line by line: the key line, the
 * indented lines under it, and the blank lines inside the block. Every other
 * line, comments included, stays as the owner wrote it.
 */
export function removeTopLevelKeys(text: string, keys: string[]): { text: string; removed: string[] } {
  const lines = text.split("\n");
  const kept: string[] = [];
  const removed: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const key = /^([A-Za-z_][\w-]*)\s*:/.exec(lines[i]!)?.[1];
    if (key === undefined || !keys.includes(key)) {
      kept.push(lines[i]!);
      continue;
    }
    removed.push(key);
    let end = i + 1;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (/^\s+\S/.test(lines[j]!)) end = j + 1;
      else if (lines[j]!.trim() !== "") break;
    }
    i = end - 1;
  }
  return { text: kept.join("\n"), removed };
}

/** Whether `lexforge/config.yaml` still holds a key 6.0.0 refuses. */
export function configNeedsMigration(root: string): boolean {
  return removeTopLevelKeys(readFileSync(workspacePaths(root).config, "utf8"), CONFIG_KEYS).removed.length > 0;
}

/** Takes the keys 6.0.0 refuses out of `lexforge/config.yaml`. */
export function migrateConfig(root: string): { changed: boolean; removed: string[] } {
  const file = workspacePaths(root).config;
  const before = readFileSync(file, "utf8");
  const { text, removed } = removeTopLevelKeys(before, CONFIG_KEYS);
  if (removed.length === 0) return { changed: false, removed: [] };
  saveText(file, text);
  return { changed: true, removed };
}

/** Whether the change already runs on workflow 3. */
export function isMigrated(root: string, change: string): boolean {
  const file = path.join(root, changeDir(change), "workflow.json");
  if (!existsSync(file)) return false;
  try {
    return (JSON.parse(readFileSync(file, "utf8")) as { version?: unknown }).version === 3;
  } catch {
    return false;
  }
}

/** The changes `lexforge migrate` without `--change` still has to carry over. */
export function pendingChanges(root: string): string[] {
  return listActiveChanges(root).filter((change) => !isMigrated(root, change));
}

function alreadyMigrated(change: string): UsageError {
  return new UsageError(
    "already-migrated",
    `change "${change}" already runs on workflow 3; nothing was written.`,
    `lexforge resume --change ${change}`,
  );
}

/**
 * Moves the files of the 5.x execution engine into `execution-5x/`: the
 * `execution/` directory becomes it, and the plan of cycles and the red-run
 * store of the change go in with it. Nothing in 6.0.0 reads them again.
 */
function putExecutionAside(dir: string, files: string[]): void {
  const aside = path.join(dir, ASIDE);
  const execution = path.join(dir, "execution");
  if (existsSync(execution)) {
    if (existsSync(aside)) {
      for (const name of readdirSync(execution)) renameSync(path.join(execution, name), path.join(aside, name));
      rmdirSync(execution);
    } else {
      renameSync(execution, aside);
    }
  }
  for (const name of files) {
    if (!existsSync(path.join(dir, name))) continue;
    mkdirSync(aside, { recursive: true });
    renameSync(path.join(dir, name), path.join(aside, name));
  }
}

/** Carries one change of LexForge 5.x over to workflow 3. */
export function migrateChange(root: string, change: string): MigrationResult {
  const dir = path.join(root, changeDir(change));
  if (!existsSync(dir)) {
    const active = listActiveChanges(root);
    throw new UsageError(
      "change-not-found",
      `there is no change named "${change}".` + (active.length > 0 ? ` Active changes: ${active.join(", ")}.` : ""),
      active.length > 0 ? `lexforge migrate --change ${active[0]}` : "lexforge new change <name>",
    );
  }
  if (isMigrated(root, change)) throw alreadyMigrated(change);

  return withChangeLock(root, change, "migrate", () => {
    const configFile = path.join(dir, ".lexforge.yaml");
    const config = removeTopLevelKeys(readFileSync(configFile, "utf8"), CHANGE_KEYS);
    const schema = String((parseYaml(config.text) as { schema?: unknown } | null)?.schema ?? "spec-driven");
    if (config.removed.length > 0) saveText(configFile, config.text);
    putExecutionAside(dir, OLD_FILES);
    writeWorkflowFile(root, change, { version: 3, schema, schemaVersion: 1, path: "full" });
    return {
      change,
      closed: [],
      reopened: [],
      open: [],
      missingFields: [],
      approved: false,
      nextStep: reviewCommand(change, "specs"),
    };
  });
}
