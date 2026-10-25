import { existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

import { UsageError } from "../../cli/errors.js";
import { tryGit } from "../git/repository.js";
import { CONFIG_FILE, WORKSPACE_DIR } from "./paths.js";

/**
 * Walks up from `cwd` looking for `lexforge/config.yaml`. The marker is the
 * file, not the directory: an empty `lexforge/` left by a failed run must not
 * pass for a workspace. The nearest one below the top of a task worktree
 * wins, including a nested project's own; only the copy carried at the top
 * of the worktree itself redirects to the main worktree.
 */
export function findWorkspaceRoot(cwd: string): string {
  let dir = path.resolve(cwd);

  for (;;) {
    const workspace = path.join(dir, WORKSPACE_DIR);

    if (existsSync(path.join(workspace, CONFIG_FILE))) {
      return mainOfTaskWorktree(dir) ?? dir;
    }

    if (existsSync(workspace)) {
      throw new UsageError(
        "workspace-incomplete",
        `${workspace} exists but holds no ${CONFIG_FILE}. Run the initialisation to finish it.`,
        "lexforge init",
        path.join(workspace, CONFIG_FILE),
      );
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new UsageError(
        "workspace-not-found",
        `no ${WORKSPACE_DIR}/ workspace here or in any parent directory of ${path.resolve(cwd)}.`,
        "lexforge init",
      );
    }
    dir = parent;
  }
}

/** Where `task start` puts the worktrees of tasks, under the main worktree. */
const TASK_WORKTREES = path.join(".lexforge", "worktrees");

/**
 * The top of the linked worktree that holds `dir`, found by its `.git` file;
 * null inside a main worktree, whose `.git` is a directory, and outside git.
 * It spares the git call for every command run outside a linked worktree.
 */
function linkedWorktreeOf(dir: string): string | null {
  for (let at = dir; ; at = path.dirname(at)) {
    const dotGit = path.join(at, ".git");
    if (existsSync(dotGit)) return statSync(dotGit).isFile() ? at : null;
    if (path.dirname(at) === at) return null;
  }
}

/**
 * A task worktree carries its own copy of `lexforge/config.yaml` at its top,
 * but the state of a change lives in the main worktree. This only redirects
 * that top-of-worktree copy: `dir` must be the worktree's own top, not a
 * directory below it, so a nested project's `lexforge/` of its own is never
 * overridden. git names the main worktree: the parent of `--git-common-dir`.
 * A linked worktree that git places under `<main>/.lexforge/worktrees/`
 * resolves to `<main>` when `<main>` is a workspace, however the path to it
 * was spelled. Other linked worktrees keep their own root.
 */
function mainOfTaskWorktree(dir: string): string | null {
  const linked = linkedWorktreeOf(dir);
  if (linked === null) return null;
  let output: string;
  try {
    const found = tryGit(linked, [
      "rev-parse", "--path-format=absolute", "--git-common-dir", "--show-toplevel",
    ]);
    if (!found.ok) return null;
    output = found.output;
  } catch {
    return null;
  }
  const [commonDir, top] = output.trim().split("\n");
  if (commonDir === undefined || top === undefined || path.basename(commonDir) !== ".git") return null;
  if (realpathSync(dir) !== realpathSync(top)) return null;
  const main = path.dirname(commonDir);
  if (main === top) return null;
  const worktrees = `${path.join(realpathSync(main), TASK_WORKTREES)}${path.sep}`;
  if (!`${realpathSync(top)}${path.sep}`.startsWith(worktrees)) return null;
  return existsSync(path.join(main, WORKSPACE_DIR, CONFIG_FILE)) ? main : null;
}
