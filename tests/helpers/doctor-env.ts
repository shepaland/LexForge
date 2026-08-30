import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { run } from "../../src/cli/run.js";
import { createCapture } from "./capture.js";
import { createGitWorkspace } from "./git-workspace.js";
import { makeWorkspace, removeWorkspace } from "./workspace.js";

/**
 * Everything `lexforge doctor` reads from the shell around it, plus the
 * cleanup for what a helper of this file created.
 */
export interface DoctorEnv {
  cwd: string;
  home: string;
  pathValue: string;
  runningFile: string;
  remove(): void;
}

/**
 * A `lexforge` stub in its own directory, so `checkPath` resolves the bare
 * name to itself. The file is never run; it carries the execute bit because
 * that is what `checkPath` looks for on Linux and macOS — a shell runs nothing
 * else. On Windows the bit does not exist and the extension decides, so the
 * stub is written under the name an installation leaves there.
 */
export function stubOnPath(root: string): { pathValue: string; runningFile: string } {
  const name = process.platform === "win32" ? "lexforge.cmd" : "lexforge";
  const runningFile = path.join(root, "bin", name);
  mkdirSync(path.dirname(runningFile), { recursive: true });
  writeFileSync(runningFile, "#!/usr/bin/env node\n", { encoding: "utf8", mode: 0o755 });
  return { pathValue: path.dirname(runningFile), runningFile };
}

/**
 * A project `lexforge doctor` reads as healthy on every one of the six
 * conditions: a git repository with a commit, skills installed to match the
 * shipped ones, and `lexforge` resolvable on `PATH`.
 */
export async function healthyDoctorEnv(): Promise<DoctorEnv> {
  const workspace = createGitWorkspace();
  const home = makeWorkspace();
  const stub = stubOnPath(workspace.root);

  const initCapture = createCapture();
  const initExit = await run(["init", "--tools", "claude"], {
    cwd: workspace.root,
    home,
    stdout: initCapture.stdout,
    stderr: initCapture.stderr,
  });
  if (initExit !== 0) {
    throw new Error(`setup failed: lexforge init exited ${initExit}: ${initCapture.err}`);
  }

  return {
    cwd: workspace.root,
    home,
    ...stub,
    remove: () => {
      workspace.remove();
      removeWorkspace(home);
    },
  };
}
