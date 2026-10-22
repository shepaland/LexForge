import { existsSync } from "node:fs";
import path from "node:path";

import { UsageError } from "../../cli/errors.js";
import { CONFIG_FILE, WORKSPACE_DIR } from "./paths.js";

/**
 * Walks up from `cwd` looking for `lexforge/config.yaml`. The marker is the
 * file, not the directory: an empty `lexforge/` left by a failed run must not
 * pass for a workspace.
 */
export function findWorkspaceRoot(cwd: string): string {
  let dir = path.resolve(cwd);
  const main = mainOfTaskWorktree(dir);
  if (main !== null) return main;

  for (;;) {
    const workspace = path.join(dir, WORKSPACE_DIR);

    if (existsSync(path.join(workspace, CONFIG_FILE))) {
      return dir;
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
const TASK_WORKTREES = `${path.sep}.lexforge${path.sep}worktrees${path.sep}`;

/**
 * A task worktree carries its own copy of `lexforge/config.yaml`, but the
 * state of a change lives in the main worktree. A directory under
 * `<main>/.lexforge/worktrees/` resolves to `<main>` when `<main>` is a
 * workspace. Other linked worktrees keep their own root.
 */
function mainOfTaskWorktree(dir: string): string | null {
  const at = `${dir}${path.sep}`.indexOf(TASK_WORKTREES);
  if (at <= 0) return null;
  const main = dir.slice(0, at);
  return existsSync(path.join(main, WORKSPACE_DIR, CONFIG_FILE)) ? main : null;
}
