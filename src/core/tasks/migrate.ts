import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { UsageError } from "../../cli/errors.js";
import { readPlanSource } from "../gates/plan-source.js";
import { parseTaskList, type PlanTask } from "../gates/task-list.js";
import { readHead } from "../git/repository.js";
import { listActiveChanges } from "../workspace/change-config.js";
import { workspacePaths } from "../workspace/paths.js";
import { saveText } from "./files.js";
import { withChangeLock } from "./lock.js";
import {
  ASIDE,
  EXECUTION_PLAN,
  RED_RUNS_FILE,
  fieldsFromExecutionPlan,
  readClosedCycles,
  readExecutionPlan,
  readRedRunTasks,
  rewritePlanFile,
} from "./migrate-fields.js";
import { changeDir } from "./paths.js";
import { planDigest, planTaskTexts, readPlanState, reviewCommand, writePlanState } from "./plan-state.js";
import { writeTaskRecord } from "./records.js";
import { writeWorkflowFile } from "./workflow-file.js";

/** Keys 6.0.0 no longer reads, by file. */
const CONFIG_KEYS = ["file_limit"];
const CHANGE_KEYS = ["long_files"];

/** Files of the 5.x engine at the top of the change directory. */
const OLD_FILES = [EXECUTION_PLAN, RED_RUNS_FILE];

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
 * The moves that put the files of the 5.x execution engine into
 * `execution-5x/`: every entry of `execution/` but `logs`, plus the plan of
 * cycles and the red-run store of the change. `execution/logs` stays where it
 * is: the evidence ledger keeps a log by its path and hash, and a moved log
 * would read as tampered. Nothing in 6.0.0 reads the moved files again.
 *
 * A target that already exists is left by an interrupted run. The moves are
 * refused before anything is written, since only the owner knows which copy
 * to keep.
 */
function asideMoves(root: string, change: string): Array<[string, string]> {
  const dir = path.join(root, changeDir(change));
  const aside = path.join(dir, ASIDE);
  const execution = path.join(dir, "execution");
  const moves: Array<[string, string]> = OLD_FILES.map((name) => [path.join(dir, name), path.join(aside, name)]);
  if (existsSync(execution)) {
    for (const name of readdirSync(execution)) {
      if (name !== "logs") moves.push([path.join(execution, name), path.join(aside, name)]);
    }
  }
  const present = moves.filter(([from]) => existsSync(from));
  const taken = present.find(([, to]) => existsSync(to));
  if (taken !== undefined) {
    const [from, to] = taken.map((file) => path.relative(root, file).split(path.sep).join("/"));
    throw new UsageError(
      "migration-aside-occupied",
      `${to} already exists, left by an interrupted run of lexforge migrate; nothing was written.`,
      `keep one of ${from} and ${to}, remove the other, then run: lexforge migrate --change ${change}`,
    );
  }
  return present;
}

function putExecutionAside(dir: string, moves: Array<[string, string]>): void {
  for (const [from, to] of moves) {
    mkdirSync(path.dirname(to), { recursive: true });
    renameSync(from, to);
  }
  const execution = path.join(dir, "execution");
  if (existsSync(execution) && readdirSync(execution).length === 0) rmdirSync(execution);
}

interface PlanMigration {
  /** New text per plan file, written only after the whole result is known. */
  texts: Map<string, string>;
  closed: string[];
  reopened: string[];
}

/**
 * Works out the plan of 6.0.0 from the plan and the cycles of 5.x. A ticked
 * task stays closed when its cycle closed or `red-runs.json` holds a red for
 * it; any other ticked task loses its tick.
 */
function migratePlan(dir: string, tasksFile: string): PlanMigration {
  const plan = readExecutionPlan(dir);
  const fields = plan === null ? new Map() : fieldsFromExecutionPlan(plan);
  const closedCycles = readClosedCycles(dir);
  const reds = readRedRunTasks(dir);
  const tasks = readPlanSource(tasksFile).tasks.filter((task) => task.number !== "");
  const closed: string[] = [];
  const reopened: string[] = [];
  for (const task of tasks.filter((item) => item.done)) {
    const cycle = fields.get(task.number)?.cycle;
    if ((cycle !== undefined && closedCycles.has(cycle)) || reds.has(task.number)) closed.push(task.number);
    else reopened.push(task.number);
  }
  const texts = new Map<string, string>();
  for (const file of [...new Set(tasks.map((task) => task.file))]) {
    const own = tasks.filter((task) => task.file === file);
    texts.set(file, rewritePlanFile(readFileSync(file, "utf8"), own, fields, (id) => closed.includes(id)));
  }
  return { texts, closed, reopened };
}

/** The open tasks and the fields each lacks, read off the rewritten plan. */
function openTasks(texts: Map<string, string>): { open: string[]; missingFields: MigrationResult["missingFields"] } {
  const tasks: PlanTask[] = [...texts.values()].flatMap((text) => parseTaskList(text));
  const open = tasks.filter((task) => !task.done && task.number !== "");
  const missingFields = open.flatMap((task) => {
    const fields: MissingField[] = [];
    if (task.files.length === 0) fields.push("Files");
    if (task.tests.length === 0 && !task.declaresMove) fields.push("Test");
    if (task.command === null) fields.push("Command");
    return fields.length === 0 ? [] : [{ task: task.number, fields }];
  });
  return { open: open.map((task) => task.number), missingFields };
}

function nextStepFor(change: string, hasPlan: boolean, open: string[], missing: number): string {
  if (!hasPlan) return `lexforge status --change ${change}`;
  if (open.length === 0) return `lexforge verify --change ${change}`;
  const review = reviewCommand(change, "specs");
  return missing > 0 ? `add the fields to the open tasks in tasks.md, then run: ${review}` : review;
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
    if (!existsSync(configFile)) {
      throw new UsageError(
        "change-config-invalid",
        `change "${change}" has no .lexforge.yaml; nothing was written.`,
        `write "schema: spec-driven" to ${changeDir(change)}/.lexforge.yaml, then run: lexforge migrate --change ${change}`,
      );
    }
    const config = removeTopLevelKeys(readFileSync(configFile, "utf8"), CHANGE_KEYS);
    const schema = String((parseYaml(config.text) as { schema?: unknown } | null)?.schema ?? "spec-driven");
    const tasksFile = path.join(dir, "tasks.md");
    const hasPlan = existsSync(tasksFile);
    const plan: PlanMigration = hasPlan ? migratePlan(dir, tasksFile) : { texts: new Map(), closed: [], reopened: [] };
    const { open, missingFields } = openTasks(plan.texts);
    const moves = asideMoves(root, change);
    const at = new Date().toISOString();
    const head = plan.closed.length > 0 || (hasPlan && open.length === 0) ? readHead(root) : "";

    if (config.removed.length > 0) saveText(configFile, config.text);
    for (const [file, text] of plan.texts) saveText(file, text);
    for (const id of plan.closed) {
      writeTaskRecord(root, change, {
        id,
        origin: "historical",
        executor: "5.x",
        branch: "",
        worktree: "",
        base: head,
        startedAt: at,
        red: null,
        green: null,
        reviews: [],
        closed: { merge: head, at },
        attempts: 0,
      });
    }
    putExecutionAside(dir, moves);
    writeWorkflowFile(root, change, { version: 3, schema, schemaVersion: 1, path: "full" });
    const approved = hasPlan && open.length === 0;
    const state = { ...readPlanState(root, change), migratedFrom: "5.x" as const };
    if (approved) {
      state.approval = {
        quote: "migrated from 5.x",
        digest: planDigest(root, change),
        base: head,
        taskTexts: planTaskTexts(root, change),
        at,
      };
    }
    writePlanState(root, change, state);
    return {
      change,
      closed: plan.closed,
      reopened: plan.reopened,
      open,
      missingFields,
      approved,
      nextStep: nextStepFor(change, hasPlan, open, missingFields.length),
    };
  });
}
