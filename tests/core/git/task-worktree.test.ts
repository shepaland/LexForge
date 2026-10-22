import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTaskWorktree,
  diffFiles,
  ensureWorktreeExcluded,
  fileExistsAt,
  isAncestor,
  mergeTaskBranch,
  removeTaskWorktree,
  currentBranch,
} from "../../../src/core/git/task-worktree.js";
import { taskWorktreePath } from "../../../src/core/tasks/paths.js";
import {
  commitAll,
  createGitWorkspace,
  git,
  writeAt,
  type GitWorkspace,
} from "../../helpers/git-workspace.js";

let workspace: GitWorkspace;
let root: string;
let first: string;
let second: string;

beforeEach(() => {
  workspace = createGitWorkspace();
  root = workspace.root;
  git(root, "config", "user.name", "LexForge Test");
  git(root, "config", "user.email", "test@example.com");
  git(root, "checkout", "-b", "feature/demo");
  writeAt(root, "src/a.ts", "export const a = 1;\n");
  first = commitAll(root, "first");
  writeAt(root, "src/b.ts", "export const b = 1;\n");
  writeAt(root, "test/b.test.ts", "// b\n");
  second = commitAll(root, "second");
});
afterEach(() => workspace.remove());

describe("task worktree", () => {
  it("creates the worktree on its own branch from the change branch tip", () => {
    const made = createTaskWorktree(root, "demo", "2.1");
    expect(made).toEqual({
      path: taskWorktreePath(root, "demo", "2.1"),
      branch: "lexforge/demo/2.1",
      base: git(root, "rev-parse", "feature/demo"),
    });
    expect(git(made.path, "branch", "--show-current")).toBe("lexforge/demo/2.1");
    expect(currentBranch(made.path)).toBe("lexforge/demo/2.1");
  });
  it("keeps .lexforge out of git status without touching .gitignore", () => {
    createTaskWorktree(root, "demo", "2.1");
    expect(git(root, "status", "--short")).toBe("");
    expect(existsSync(join(root, ".gitignore"))).toBe(false);
  });
  it("writes the exclude line once", () => {
    ensureWorktreeExcluded(root);
    ensureWorktreeExcluded(root);
    const exclude = git(root, "rev-parse", "--git-path", "info/exclude");
    const text = readFileSync(join(root, exclude), "utf8");
    expect(text.split("\n").filter((line) => line === "/.lexforge/")).toHaveLength(1);
  });
  it("answers ancestry and diff", () => {
    expect(isAncestor(root, first, second)).toBe(true);
    expect(isAncestor(root, second, first)).toBe(false);
    expect(diffFiles(root, first, second)).toEqual(["src/b.ts", "test/b.test.ts"]);
    expect(fileExistsAt(root, first, "src/b.ts")).toBe(false);
    expect(fileExistsAt(root, second, "src/b.ts")).toBe(true);
  });
  it("answers the current branch, and null when detached", () => {
    expect(currentBranch(root)).toBe("feature/demo");
    git(root, "checkout", "--detach");
    expect(currentBranch(root)).toBeNull();
  });
  it("merges a clean branch and names the conflicting files otherwise", () => {
    const one = createTaskWorktree(root, "demo", "2.1");
    const two = createTaskWorktree(root, "demo", "2.2");
    writeAt(one.path, "src/a.ts", "export const a = 2;\n");
    commitAll(one.path, "task 2.1");
    writeAt(two.path, "src/a.ts", "export const a = 3;\n");
    commitAll(two.path, "task 2.2");

    const merged = mergeTaskBranch(root, one.branch, "Merge task 2.1");
    expect(merged).toMatchObject({ merged: true });
    expect(merged).toEqual({ merged: true, commit: git(root, "rev-parse", "HEAD") });
    expect(mergeTaskBranch(root, two.branch, "Merge task 2.2")).toEqual({
      merged: false,
      conflicts: ["src/a.ts"],
    });
    expect(git(root, "status", "--short")).toBe("");
  });
  it("removes the worktree and its branch", () => {
    const made = createTaskWorktree(root, "demo", "2.1");
    removeTaskWorktree(root, made.path, made.branch);
    expect(existsSync(made.path)).toBe(false);
    expect(git(root, "branch", "--list", made.branch)).toBe("");
  });
});
