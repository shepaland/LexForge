import { existsSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { createGitWorkspace, git, writeAt, type GitWorkspace } from "../helpers/git-workspace.js";

const created: GitWorkspace[] = [];

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

async function call(argv: string[], cwd: string) {
  const capture = createCapture();
  const exitCode = await run(argv, { cwd, stdout: capture.stdout, stderr: capture.stderr });
  return { exitCode, capture };
}

describe("lexforge new change on a repository", () => {
  it("opens feature/<name> from dev and reports the created branches", async () => {
    const made = createGitWorkspace();
    created.push(made);

    const { exitCode, capture } = await call(["new", "change", "add-auth", "--json"], made.root);
    const data = JSON.parse(capture.out) as { createdBranches?: string[] };

    expect(exitCode).toBe(0);
    expect(git(made.root, "branch", "--show-current"), "\nNew change does not open a feature branch\n").toBe(
      "feature/add-auth",
    );
    expect(data.createdBranches).toEqual(["dev", "feature/add-auth"]);
    expect(existsSync(path.join(made.root, "lexforge/changes/add-auth"))).toBe(true);
  });

  it("refuses a dirty tree with worktree-dirty and leaves no change directory", async () => {
    const made = createGitWorkspace();
    created.push(made);
    writeAt(made.root, "src/app.ts", "export const changed = true;\n");

    const { exitCode, capture } = await call(["new", "change", "add-auth", "--json"], made.root);

    expect(exitCode).toBe(2);
    expect(capture.out + capture.err).toContain("worktree-dirty");
    expect(existsSync(path.join(made.root, "lexforge/changes/add-auth"))).toBe(false);
    expect(git(made.root, "branch", "--show-current")).toBe("main");
  });
});
