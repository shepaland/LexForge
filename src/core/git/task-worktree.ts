import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { UsageError } from "../../cli/errors.js";
import { taskBranchName, taskWorktreePath } from "../tasks/paths.js";
import { featureBranchName } from "./feature-branch.js";
import { readGit, tryGit } from "./repository.js";

/**
 * Backslash-escapes the characters a gitignore pattern treats as special
 * (`\`, `*`, `?`, `[`, `]`) plus a leading `#` or `!`, so a workspace
 * directory name is matched literally rather than as a glob.
 */
function escapeGitignoreSegment(segment: string): string {
  return segment.replace(/[\\*?[\]!#]/g, "\\$&");
}

/**
 * The exclude line that hides `root`'s own `.lexforge/`, anchored to the
 * repository's top so a `.lexforge/` the workspace does not own is left
 * alone. `path.relative` can return `\`-separated segments on Windows; the
 * split takes either separator so the written line always uses `/`, which is
 * the only separator a gitignore pattern accepts.
 */
function worktreeExcludeLine(toplevel: string, root: string): string {
  const relative = path.relative(toplevel, root);
  const segments = relative.split(/[\\/]+/).filter((segment) => segment.length > 0);
  if (segments.length === 0) return "/.lexforge/";
  return `/${segments.map(escapeGitignoreSegment).join("/")}/.lexforge/`;
}

/** Keeps `.lexforge/` out of `git status` through the repository's own exclude file, so no tracked file changes. */
export function ensureWorktreeExcluded(root: string): void {
  const common = readGit(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const toplevel = readGit(root, ["rev-parse", "--path-format=absolute", "--show-toplevel"]);
  const line = worktreeExcludeLine(toplevel, root);
  const file = path.join(common, "info", "exclude");
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (text.split(/\r?\n/).includes(line)) return;
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, (text === "" || text.endsWith("\n") ? "" : "\n") + line + "\n");
}

export function createTaskWorktree(
  root: string,
  change: string,
  taskId: string,
): { path: string; branch: string; base: string } {
  ensureWorktreeExcluded(root);
  const target = taskWorktreePath(root, change, taskId);
  const branch = taskBranchName(change, taskId);
  const feature = featureBranchName(change);
  const base = readGit(root, ["rev-parse", "--verify", feature]);
  readGit(root, ["worktree", "add", "-b", branch, target, feature]);
  return { path: target, branch, base };
}

export function removeTaskWorktree(root: string, worktree: string, branch: string): void {
  readGit(root, ["worktree", "remove", "--force", worktree]);
  readGit(root, ["branch", "-D", branch]);
}

export function isAncestor(cwd: string, older: string, newer: string): boolean {
  return tryGit(cwd, ["merge-base", "--is-ancestor", older, newer]).ok;
}

export function diffFiles(cwd: string, from: string, to: string): string[] {
  const out = readGit(cwd, ["diff", "--name-only", from, to]);
  return out === "" ? [] : out.split("\n").sort();
}

export function fileExistsAt(cwd: string, commit: string, file: string): boolean {
  return tryGit(cwd, ["cat-file", "-e", `${commit}:${file}`]).ok;
}

/** The branch HEAD stands on, or null when HEAD is detached. */
export function currentBranch(cwd: string): string | null {
  const call = tryGit(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  return call.ok ? call.output.trim() : null;
}

export function mergeTaskBranch(
  root: string,
  branch: string,
  message: string,
): { merged: true; commit: string } | { merged: false; conflicts: string[] } {
  const call = tryGit(root, ["merge", "--no-ff", "-m", message, branch]);
  if (call.ok) return { merged: true, commit: readGit(root, ["rev-parse", "HEAD"]) };
  const out = readGit(root, ["diff", "--name-only", "--diff-filter=U"]);
  const conflicts = out === "" ? [] : out.split("\n").sort();
  tryGit(root, ["merge", "--abort"]);
  if (conflicts.length === 0) {
    throw new UsageError(
      "git-failed",
      `git merge ${branch} failed in ${root}: ${call.output}`,
      "fix the repository, then run this command again",
    );
  }
  return { merged: false, conflicts };
}
