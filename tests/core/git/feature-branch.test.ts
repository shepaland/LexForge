import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import {
  commitAll,
  createGitWorkspace,
  createPlainWorkspace,
  git,
  writeAt,
  type GitWorkspace,
} from "../../helpers/git-workspace.js";

interface FeatureBranch {
  openFeatureBranch(root: string, name: string): { createdBranches: string[] };
  assertBranchable(root: string, name: string): void;
}

const created: GitWorkspace[] = [];

function keep(workspace: GitWorkspace): GitWorkspace {
  created.push(workspace);
  return workspace;
}

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

/** Loads the module so that its absence fails an assertion, not the import. */
async function load(): Promise<FeatureBranch> {
  let loaded: Partial<FeatureBranch> | undefined;

  try {
    loaded = (await import("../../../src/core/git/feature-branch.js")) as Partial<FeatureBranch>;
  } catch {
    loaded = undefined;
  }

  expect(typeof loaded?.openFeatureBranch, "\nThe feature branch is not implemented\n").toBe(
    "function",
  );
  return loaded as FeatureBranch;
}

function refusal(call: () => unknown): UsageError {
  try {
    call();
  } catch (error) {
    expect(error).toBeInstanceOf(UsageError);
    return error as UsageError;
  }

  throw new Error("expected a UsageError, got none");
}

describe("openFeatureBranch", () => {
  it("with a dev branch checks out feature/add-auth made from dev", async () => {
    const { openFeatureBranch } = await load();
    const workspace = keep(createGitWorkspace());
    git(workspace.root, "branch", "dev");
    git(workspace.root, "checkout", "dev");
    writeAt(workspace.root, "src/dev.ts", "export const dev = 1;\n");
    const devTip = commitAll(workspace.root, "dev commit");
    git(workspace.root, "checkout", "main");

    const result = openFeatureBranch(workspace.root, "add-auth");

    expect(result.createdBranches).toEqual(["feature/add-auth"]);
    expect(git(workspace.root, "rev-parse", "--abbrev-ref", "HEAD")).toBe("feature/add-auth");
    expect(git(workspace.root, "rev-parse", "HEAD")).toBe(devTip);
  });

  it("without dev creates dev from main first and returns both branches", async () => {
    const { openFeatureBranch } = await load();
    const workspace = keep(createGitWorkspace());

    const result = openFeatureBranch(workspace.root, "add-auth");

    expect(result.createdBranches).toEqual(["dev", "feature/add-auth"]);
    expect(git(workspace.root, "rev-parse", "dev")).toBe(workspace.head);
    expect(git(workspace.root, "rev-parse", "--abbrev-ref", "HEAD")).toBe("feature/add-auth");
  });

  it("refuses an existing feature/add-auth with feature-branch-exists", async () => {
    const { openFeatureBranch } = await load();
    const workspace = keep(createGitWorkspace());
    git(workspace.root, "branch", "feature/add-auth");

    const error = refusal(() => openFeatureBranch(workspace.root, "add-auth"));

    expect(error.code).toBe("feature-branch-exists");
    expect(error.message).toContain("feature/add-auth");
    expect(git(workspace.root, "branch", "--list", "dev")).toBe("");
  });

  it("refuses a modified tracked file outside lexforge/changes and names it", async () => {
    const { openFeatureBranch } = await load();
    const workspace = keep(createGitWorkspace());
    writeAt(workspace.root, "src/app.ts", "export const changed = true;\n");

    const error = refusal(() => openFeatureBranch(workspace.root, "add-auth"));

    expect(error.code).toBe("worktree-dirty");
    expect(error.message).toContain("src/app.ts");
    expect(error.nextStep).toContain("commit or stash");
    expect(git(workspace.root, "branch", "--list", "dev")).toBe("");
    expect(git(workspace.root, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
  });

  it("does not count a change only under lexforge/changes", async () => {
    const { openFeatureBranch } = await load();
    const workspace = keep(createGitWorkspace());
    writeAt(workspace.root, "lexforge/changes/other/proposal.md", "# other\n");

    const result = openFeatureBranch(workspace.root, "add-auth");

    expect(result.createdBranches).toEqual(["dev", "feature/add-auth"]);
  });

  it("refuses a plain directory with not-a-git-repository", async () => {
    const { openFeatureBranch } = await load();
    const workspace = keep(createPlainWorkspace());

    const error = refusal(() => openFeatureBranch(workspace.root, "add-auth"));

    expect(error.code).toBe("not-a-git-repository");
  });
});

function branches(root: string): string {
  return git(root, "branch", "--list", "--format=%(refname:short)");
}

describe("assertBranchable", () => {
  it("runs the refusals without writing", async () => {
    const { assertBranchable } = await load();
    const workspace = keep(createGitWorkspace());

    expect(() => assertBranchable(workspace.root, "add-auth")).not.toThrow();
    expect(git(workspace.root, "branch", "--list")).toBe("* main");
  });

  it("refuses an existing feature branch and creates no branch", async () => {
    const { assertBranchable } = await load();
    const workspace = keep(createGitWorkspace());
    git(workspace.root, "branch", "feature/add-auth");

    const error = refusal(() => assertBranchable(workspace.root, "add-auth"));

    expect(error.code).toBe("feature-branch-exists");
    expect(branches(workspace.root)).toBe("feature/add-auth\nmain");
  });

  it("refuses a dirty tree, suggests commit or stash and creates no branch", async () => {
    const { assertBranchable } = await load();
    const workspace = keep(createGitWorkspace());
    writeAt(workspace.root, "src/app.ts", "export const changed = true;\n");

    const error = refusal(() => assertBranchable(workspace.root, "add-auth"));

    expect(error.code).toBe("worktree-dirty");
    expect(error.nextStep).toContain("commit or stash");
    expect(branches(workspace.root)).toBe("main");
  });

  it("names a dirty path with a non-ASCII character as it is", async () => {
    const { assertBranchable } = await load();
    const workspace = keep(createGitWorkspace());
    writeAt(workspace.root, "src/приложение.ts", "export const x = 1;\n");

    const error = refusal(() => assertBranchable(workspace.root, "add-auth"));

    expect(error.code).toBe("worktree-dirty");
    expect(error.message).toContain("src/приложение.ts");
  });

  it("names the origin of a renamed file", async () => {
    const { assertBranchable } = await load();
    const workspace = keep(createGitWorkspace());
    git(workspace.root, "mv", "src/app.ts", "src/main.ts");

    const error = refusal(() => assertBranchable(workspace.root, "add-auth"));

    expect(error.message).toContain("src/main.ts");
    expect(error.message).toContain("src/app.ts");
  });

  it("filters lexforge/changes in a workspace inside a repository subdirectory", async () => {
    const { assertBranchable } = await load();
    const workspace = keep(createGitWorkspace({ "app/lexforge/config.yaml": "schema: spec-driven\n" }));
    const root = `${workspace.root}/app`;
    writeAt(root, "lexforge/changes/other/proposal.md", "# other\n");

    expect(() => assertBranchable(root, "add-auth")).not.toThrow();
  });

  it("refuses a plain directory and creates nothing", async () => {
    const { assertBranchable } = await load();
    const workspace = keep(createPlainWorkspace());

    const error = refusal(() => assertBranchable(workspace.root, "add-auth"));

    expect(error.code).toBe("not-a-git-repository");
  });

  it("refuses with neither dev nor main and writes nothing", async () => {
    const { assertBranchable } = await load();
    const workspace = keep(createGitWorkspace());
    git(workspace.root, "branch", "--move", "main", "trunk");

    const error = refusal(() => assertBranchable(workspace.root, "add-auth"));

    expect(error.code).toBe("main-branch-missing");
    expect(error.nextStep).not.toBe("");
    expect(branches(workspace.root)).toBe("trunk");
  });
});
