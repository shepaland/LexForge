import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import {
  commitAll,
  createGitWorkspace,
  git,
  writeAt,
  type GitWorkspace,
} from "../../helpers/git-workspace.js";

interface MergeFeature {
  mergeFeature(root: string, name: string): { merged: boolean };
}

const created: GitWorkspace[] = [];

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

/** Loads the module so that its absence fails an assertion, not the import. */
async function load(): Promise<MergeFeature> {
  let loaded: Partial<MergeFeature> | undefined;

  try {
    loaded = (await import("../../../src/core/git/merge-feature.js")) as Partial<MergeFeature>;
  } catch {
    loaded = undefined;
  }

  expect(typeof loaded?.mergeFeature, "\nThe merge into dev is not implemented\n").toBe("function");

  return loaded as MergeFeature;
}

/** A repository on feature/add-auth, branched from dev, with a.txt committed. */
function featureWorkspace(): GitWorkspace {
  const workspace = createGitWorkspace({ "a.txt": "base\n" });
  created.push(workspace);
  git(workspace.root, "config", "user.name", "LexForge Test");
  git(workspace.root, "config", "user.email", "test@example.com");
  git(workspace.root, "config", "commit.gpgsign", "false");
  git(workspace.root, "branch", "dev");
  git(workspace.root, "checkout", "-b", "feature/add-auth", "dev");
  return workspace;
}

describe("mergeFeature", () => {
  it("commits the work, merges it into dev with a merge commit and keeps the feature branch", async () => {
    const { mergeFeature } = await load();
    const { root } = featureWorkspace();

    writeAt(root, "b.txt", "feature work\n");

    expect(mergeFeature(root, "add-auth")).toEqual({ merged: true });

    const feature = git(root, "rev-parse", "feature/add-auth");
    const parents = git(root, "rev-list", "--parents", "-n", "1", "dev").split(" ").slice(1);

    expect(git(root, "branch", "--show-current")).toBe("dev");
    expect(parents).toEqual([git(root, "rev-parse", "dev^1"), feature]);
    expect(git(root, "show", "feature/add-auth:b.txt")).toBe("feature work");
    expect(git(root, "show", "dev:b.txt")).toBe("feature work");
    expect(git(root, "status", "--porcelain")).toBe("");
  });

  it("aborts on a conflict, returns to the feature branch and names the file", async () => {
    const { mergeFeature } = await load();
    const { root } = featureWorkspace();

    writeAt(root, "a.txt", "feature edit\n");
    commitAll(root, "feature edit");
    git(root, "checkout", "dev");
    writeAt(root, "a.txt", "dev edit\n");
    commitAll(root, "dev edit");
    git(root, "checkout", "feature/add-auth");

    let thrown: unknown;

    try {
      mergeFeature(root, "add-auth");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UsageError);
    expect((thrown as UsageError).code).toBe("merge-conflict");
    expect((thrown as UsageError).message).toContain("a.txt");
    expect(git(root, "branch", "--show-current")).toBe("feature/add-auth");
    expect(git(root, "status", "--porcelain")).toBe("");
  });

  it("does nothing when the current branch is not the feature branch", async () => {
    const { mergeFeature } = await load();
    const { root } = featureWorkspace();

    git(root, "checkout", "main");
    writeAt(root, "c.txt", "loose\n");

    expect(mergeFeature(root, "add-auth")).toEqual({ merged: false });
    expect(git(root, "branch", "--show-current")).toBe("main");
    expect(git(root, "status", "--porcelain")).toBe("?? c.txt");
  });
});
