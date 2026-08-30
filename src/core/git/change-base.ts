import { WORKSPACE_DIR } from "../workspace/paths.js";
import { readGit, readHead } from "./repository.js";

/** Path of a change directory as git sees it, relative to the workspace root. */
function changeDirectory(change: string): string {
  return `${WORKSPACE_DIR}/changes/${change}`;
}

/**
 * The commit work on this change starts from: the one that brought the change
 * directory into the repository. Everything touched after it counts as the
 * work of this change.
 *
 * A change directory that is not committed yet leaves the current commit as
 * the base, so the whole working tree counts as its work.
 */
export function changeBase(root: string, change: string): string {
  const log = readGit(root, [
    "log",
    "--diff-filter=A",
    "--format=%H",
    "--",
    changeDirectory(change),
  ]);

  const commits = log
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

  return commits.at(-1) ?? readHead(root);
}

/**
 * Files the change has touched: everything different from the base commit,
 * committed or not, plus files git has never seen. The `lexforge/` directory
 * stays out — the artifacts of the change are the plan, not the work.
 */
export function changedFiles(root: string, base: string): string[] {
  const exclude = ["--", ".", `:(exclude)${WORKSPACE_DIR}`];

  const tracked = readGit(root, ["diff", "--name-only", "-z", base, ...exclude]);
  const untracked = readGit(root, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "--full-name",
    "-z",
    ...exclude,
  ]);

  const files = new Set(
    `${tracked}\0${untracked}`.split("\0").filter((entry) => entry.trim() !== ""),
  );

  return [...files].sort();
}
