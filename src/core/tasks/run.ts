import { spawnSync } from "node:child_process";
import { fileExistsAt } from "../git/task-worktree.js";

/** One run of a task's `Command:`. `tail` holds the last lines of the output, `log` all of it. */
export interface CommandRun {
  exitCode: number;
  tail: string;
  log: string;
}

export type RedVerdict = { kind: "red" } | { kind: "passed" } | { kind: "broken"; reason: string };

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

function namesNewFile(specifier: string, created: string[]): boolean {
  const named = normalize(specifier);
  return created.some((file) => named === file || named.endsWith(`/${file}`));
}

function missingModule(log: string, created: string[]): RedVerdict | null {
  for (const pattern of MISSING) {
    for (const match of log.matchAll(pattern)) {
      const specifier = match[1]!;
      if (isPackage(specifier)) return { kind: "broken", reason: `the package "${specifier}" is missing: ${SETUP_HINT}` };
      if (!namesNewFile(specifier, created)) {
        return {
          kind: "broken",
          reason: `the module "${specifier}" is missing, and it is not a file the task creates in Files:`,
        };
      }
    }
  }
  return null;
}

function typeErrors(log: string, created: string[]): RedVerdict | null {
  for (const line of log.split("\n")) {
    if (!line.includes("error TS")) continue;
    const at = TS_ERROR.exec(line)?.[1];
    const inNewFile = at !== undefined && namesNewFile(at, created);
    const missing = /Cannot find module ['"]([^'"]+)['"]/.exec(line)?.[1];
    const missingNew = missing !== undefined && !isPackage(missing) && namesNewFile(missing, created);
    if (!inNewFile && !missingNew) {
      return { kind: "broken", reason: `the compiler fails outside the files the task creates: ${line.trim()}` };
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
    return { kind: "broken", reason: `the shell could not run the command (exit ${run.exitCode}): ${SETUP_HINT}` };
  }
  if (run.log.includes("No test files found")) {
    return { kind: "broken", reason: "the test runner found no test files: check the path in the task's Command:" };
  }
  const hasMissing = /Cannot find (?:module|package)|ERR_MODULE_NOT_FOUND|Failed to load url/.test(run.log);
  const hasTs = run.log.includes("error TS");
  if (!hasMissing && !hasTs) return { kind: "red" };
  const created = newFiles(ctx);
  return typeErrors(run.log, created) ?? missingModule(run.log, created) ?? { kind: "red" };
}
