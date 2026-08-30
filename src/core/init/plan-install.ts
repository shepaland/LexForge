import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { UsageError } from "../../cli/errors.js";
import { manifestPath, readManifest } from "./install-manifest.js";
import type { InstallScope } from "./tool-registry.js";
import { knownTools, toolDirectory } from "./tool-registry.js";

/** `skills/` sits next to `src/` and `dist/`, three levels above this module. */
export function builtinSkillsDir(): string {
  return fileURLToPath(new URL("../../../skills", import.meta.url));
}

export type InstallState = "created" | "updated" | "unchanged";

export interface InstallEntry {
  path: string;
  content: string;
  state: InstallState;
}

export interface PlanInstallOptions {
  /** The project root the skill directories are written under. */
  root: string;
  tools: string[];
  /** Into the project by default; `user` writes under the home directory. */
  scope?: InstallScope;
  /** The home directory the user scope writes under. */
  home?: string;
  skillsDir?: string;
}

/** Everything one installation does, worked out before a single file is touched. */
export interface InstallPlan {
  /** Files to write, in the order they are written. */
  files: InstallEntry[];
  /**
   * Files to delete: the previous manifest named them, this version does not
   * carry them. Nothing outside that list is ever deleted.
   */
  removed: string[];
  /**
   * Directories the removal leaves empty, deepest first. A directory that still
   * holds anything a person put there stays.
   */
  emptied: string[];
  /** One manifest per tool: where it goes and what this installation writes. */
  manifests: PlannedManifest[];
  /**
   * Skill directories of LexForge that no manifest accounts for: a version
   * that wrote no manifest left them, and a person decides their fate. The
   * installation names them and leaves them where they are.
   */
  unmanaged: string[];
}

/** The record one installation leaves next to a skills directory. */
export interface PlannedManifest {
  /** Absolute path of the manifest file itself. */
  path: string;
  tool: string;
  scope: InstallScope;
  /** Absolute path of the skills directory the manifest describes. */
  skillsDir: string;
  /** Files this installation writes, relative to the skills directory. */
  files: string[];
}

/**
 * The names this package gives its own skills: `lexforge` and `lexforge-<step>`.
 * A directory outside this family belongs to someone else and is never named.
 */
const SKILL_NAME = /^lexforge(-[a-z0-9]+(-[a-z0-9]+)*)?$/;

/**
 * Works out every file the installation would write, and writes nothing. All
 * tool names are checked first, so an unknown name stops the run before the
 * first file lands on disk.
 */
export function planSkillInstall(options: PlanInstallOptions): InstallPlan {
  const scope = options.scope ?? "project";
  const root = path.resolve(options.root);

  // A project path is relative to the project root; a user path is already
  // absolute, and `path.resolve` leaves it alone.
  const directories = options.tools.map((tool) => {
    const directory = toolDirectory(tool, scope, options.home);
    if (!directory) {
      throw new UsageError(
        "tool-unknown",
        `there is no tool named "${tool}". Supported tools: ${knownTools().join(", ")}.`,
      );
    }
    return directory;
  });

  const source = path.resolve(options.skillsDir ?? builtinSkillsDir());
  const shipped = existsSync(source) ? walk(source) : [];

  const files: InstallEntry[] = [];
  const removed: string[] = [];
  const emptied: string[] = [];
  const manifests: PlannedManifest[] = [];
  const unmanaged: string[] = [];
  for (const [index, directory] of directories.entries()) {
    const skillsDir = path.resolve(root, directory);
    for (const relative of shipped) {
      const target = path.join(skillsDir, relative);
      const content = readFileSync(path.join(source, relative), "utf8");
      files.push({ path: target, content, state: stateOf(target, content) });
    }
    manifests.push({
      path: manifestPath(skillsDir),
      tool: options.tools[index]!,
      scope,
      skillsDir,
      files: shipped.map((file) => file.split(path.sep).join("/")),
    });

    const retiredFiles = retired(skillsDir, shipped);
    removed.push(...retiredFiles);
    emptied.push(...emptiedBy(retiredFiles, files));
    unmanaged.push(...leftBehind(skillsDir, shipped, retiredFiles));
  }

  return { files, removed, emptied, manifests, unmanaged };
}

/**
 * Directories that hold nothing once the removal is done. Deepest first, so a
 * caller deleting them in order never meets a directory with a live child.
 */
function emptiedBy(retiredFiles: string[], written: InstallEntry[]): string[] {
  const gone = new Set(retiredFiles);
  const staying = new Set(written.map((entry) => entry.path));

  const directories = new Set(retiredFiles.map((file) => path.dirname(file)));
  const empty: string[] = [];

  for (const directory of directories) {
    const survivors = walk(directory)
      .map((relative) => path.join(directory, relative))
      .filter((file) => !gone.has(file));

    if (survivors.length === 0 && !hasChildIn(staying, directory)) {
      empty.push(directory);
    }
  }

  return empty.sort((a, b) => b.length - a.length);
}

/** Whether the installation is about to write anything inside this directory. */
function hasChildIn(written: Set<string>, directory: string): boolean {
  for (const file of written) {
    if (!path.relative(directory, file).startsWith("..")) {
      return true;
    }
  }

  return false;
}

/**
 * Skill directories of this package that neither the current release nor the
 * previous manifest accounts for. They stay on disk: the file that would say
 * this package wrote them is not there, and a guess is not a reason to delete.
 */
function leftBehind(skillsDir: string, shipped: string[], retiredFiles: string[]): string[] {
  if (!existsSync(skillsDir)) {
    return [];
  }

  const carried = new Set(shipped.map((file) => file.split(path.sep)[0]));
  const accounted = new Set(
    retiredFiles.map((file) => path.relative(skillsDir, file).split(path.sep)[0]),
  );

  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => SKILL_NAME.test(name) && !carried.has(name) && !accounted.has(name))
    .sort()
    .map((name) => path.join(skillsDir, name));
}

/**
 * What the previous installation wrote and this one does not: the file is
 * deleted only because a manifest named it. No manifest, no deletion — a file
 * this package never wrote is not this package's to remove.
 */
function retired(skillsDir: string, shipped: string[]): string[] {
  const manifestFile = manifestPath(skillsDir);
  if (!existsSync(manifestFile)) {
    return [];
  }

  const manifest = readManifest(readFileSync(manifestFile, "utf8"));
  if (!manifest) {
    return [];
  }

  const carried = new Set(shipped.map((file) => file.split(path.sep).join("/")));

  return manifest.files
    .filter((file) => !carried.has(file))
    .map((file) => path.join(skillsDir, ...file.split("/")))
    .filter((target) => existsSync(target));
}

/** A file that already holds the shipped text is left alone, not rewritten. */
function stateOf(target: string, content: string): InstallState {
  if (!existsSync(target)) {
    return "created";
  }
  return readFileSync(target, "utf8") === content ? "unchanged" : "updated";
}

/** Every file under `dir`, as paths relative to it, sorted for a stable plan. */
function walk(dir: string, prefix = ""): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true }).sort(byName)) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      found.push(...walk(path.join(dir, entry.name), relative));
    } else if (entry.isFile()) {
      found.push(relative);
    }
  }

  return found;
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}
