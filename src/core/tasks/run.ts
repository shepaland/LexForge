import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileExistsAt } from "../git/task-worktree.js";

/** One run of a task's `Command:`. `tail` holds the last lines of the output, `log` all of it. */
export interface CommandRun {
  exitCode: number;
  tail: string;
  log: string;
}

/**
 * Why a run never reached the test: a module the task does not declare in
 * `Files:` (the plan must change), or the worktree, its tools or its
 * dependencies (the setup must change).
 */
export type BrokenCause = "undeclared-module" | "environment";

export type RedVerdict =
  | { kind: "red" }
  | { kind: "passed" }
  | { kind: "broken"; cause: BrokenCause; reason: string };

export interface RedContext {
  /** A directory inside the repository, for reading the task base. */
  cwd: string;
  /** The commit the task started from. */
  base: string;
  /** The task's `Files:`. */
  declaredFiles: string[];
}

const TAIL_LINES = 40;
const MAX_BUFFER = 64 * 1024 * 1024;

/** Runs the command through the shell in `cwd`, standard output and errors in one stream. */
export function runTaskCommand(cwd: string, command: string): CommandRun {
  const run = spawnSync(`${command} 2>&1`, {
    cwd,
    shell: true,
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = `${run.stdout ?? ""}${run.stderr ?? ""}${run.error ? `${run.error.message}\n` : ""}`;
  const exitCode = typeof run.status === "number" ? run.status : 1;
  const lines = log.replace(/\n+$/, "").split("\n");
  return { exitCode, tail: lines.slice(-TAIL_LINES).join("\n"), log };
}

const SETUP_HINT =
  "the worktree lacks what the project installs; set `worktree.setup` in lexforge/config.yaml " +
  "to the install command, so a new task worktree gets it";

/** Module specifiers named by "cannot find" errors of node, its ESM loader and vite. */
const MISSING = [
  /Cannot find (?:module|package) ['"]([^'"]+)['"]/g,
  /Failed to load url (\S+)/g,
];

/** `src/a.ts(1,1): error TS…` or `src/a.ts:1:1 - error TS…`. */
const TS_ERROR = /^\s*(\S+?)(?:\(\d+,\d+\)|:\d+:\d+)\s*[:-]\s*error TS\d+/;

function isPackage(specifier: string): boolean {
  return !/^(?:[./\\]|[A-Za-z]:[\\/]|file:)/.test(specifier);
}

function normalize(file: string): string {
  return file.replace(/\\/g, "/");
}

/** A declared file the task creates: absent at the base and named in `Files:`. */
function newFiles(ctx: RedContext): string[] {
  return ctx.declaredFiles.map(normalize).filter((file) => !fileExistsAt(ctx.cwd, ctx.base, file));
}

const SOURCE_EXT = /\.(?:[cm]?[jt]sx?)$/;

/** A module path without its extension, so `search.js` and `search.ts` name one module. */
function stem(file: string): string {
  return normalize(file).replace(SOURCE_EXT, "");
}

function sameModule(candidate: string, file: string): boolean {
  const named = stem(candidate);
  const declared = stem(file);
  return named === declared || named.endsWith(`/${declared}`);
}

/**
 * Whether a specifier names a file the task creates. A relative specifier is
 * resolved against its importer; without an importer in the log, against the
 * directory of each file the task declares.
 */
function namesNewFile(specifier: string, created: string[], importers: string[]): boolean {
  const named = normalize(specifier);
  const candidates = /^\.\.?\//.test(named)
    ? importers.map((importer) => path.posix.join(path.posix.dirname(normalize(importer)), named))
    : [named];
  return candidates.some((candidate) => created.some((file) => sameModule(candidate, file)));
}

/** The importer named after a "cannot find" error: `imported from '<file>'` or vite's `in <file>`. */
const IMPORTER = [/imported from ['"]?([^'"\s]+)/, / in ((?:[A-Za-z]:)?[^\s'"]+?\.[cm]?[jt]sx?)\b/];

function importerOf(rest: string): string | undefined {
  for (const pattern of IMPORTER) {
    const found = pattern.exec(rest)?.[1];
    if (found !== undefined) return found;
  }
  return undefined;
}

function missingModule(log: string, created: string[], declared: string[]): RedVerdict | null {
  for (const pattern of MISSING) {
    for (const match of log.matchAll(pattern)) {
      const specifier = match[1]!;
      if (isPackage(specifier)) {
        return { kind: "broken", cause: "environment", reason: `the package "${specifier}" is missing: ${SETUP_HINT}` };
      }
      const rest = log.slice(match.index! + match[0].length).split("\n", 1)[0]!;
      const importer = importerOf(rest);
      if (!namesNewFile(specifier, created, importer === undefined ? declared : [importer])) {
        return {
          kind: "broken",
          cause: "undeclared-module",
          reason: `the module "${specifier}" is missing, and it is not a file the task creates in Files:`,
        };
      }
    }
  }
  return null;
}

function typeErrors(log: string, created: string[], declared: string[]): RedVerdict | null {
  for (const line of log.split("\n")) {
    if (!line.includes("error TS")) continue;
    const at = TS_ERROR.exec(line)?.[1];
    const inNewFile = at !== undefined && namesNewFile(at, created, declared);
    const missing = /Cannot find module ['"]([^'"]+)['"]/.exec(line)?.[1];
    const missingNew =
      missing !== undefined && !isPackage(missing) && namesNewFile(missing, created, at === undefined ? declared : [at]);
    if (!inNewFile && !missingNew) {
      const cause = missing !== undefined && !isPackage(missing) ? "undeclared-module" : "environment";
      const reason = `the compiler fails outside the files the task creates: ${line.trim()}`;
      return { kind: "broken", cause, reason };
    }
  }
  return null;
}

/**
 * Whether a run counts as red. A failing exit counts, unless the output shows
 * the run never reached the test: the shell found no command, the runner found
 * no test, a module or package is missing, or the compiler fails. A missing
 * module or a compiler error in a file the task creates still counts as red.
 */
export function classifyRed(run: CommandRun, ctx: RedContext): RedVerdict {
  if (run.exitCode === 0) return { kind: "passed" };
  if (run.exitCode === 126 || run.exitCode === 127) {
    const reason = `the shell could not run the command (exit ${run.exitCode}): ${SETUP_HINT}`;
    return { kind: "broken", cause: "environment", reason };
  }
  if (run.log.includes("No test files found")) {
    const reason = "the test runner found no test files: check the path in the task's Command:";
    return { kind: "broken", cause: "environment", reason };
  }
  const hasMissing = /Cannot find (?:module|package)|ERR_MODULE_NOT_FOUND|Failed to load url/.test(run.log);
  const hasTs = run.log.includes("error TS");
  if (!hasMissing && !hasTs) return { kind: "red" };
  const created = newFiles(ctx);
  const declared = ctx.declaredFiles.map(normalize);
  return typeErrors(run.log, created, declared) ?? missingModule(run.log, created, declared) ?? { kind: "red" };
}
