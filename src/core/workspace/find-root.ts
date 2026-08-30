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
