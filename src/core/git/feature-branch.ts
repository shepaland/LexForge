import { UsageError } from "../../cli/errors.js";
import { readGit, tryGit } from "./repository.js";

const DEV = "dev";
const MAIN = "main";
const CHANGES_DIRECTORY = "lexforge/changes";

export interface FeatureBranchResult {
  /** The branches this call created, `dev` first when it was missing. */
  createdBranches: string[];
}

/** The branch a change of this name lives on. */
export function featureBranchName(name: string): string {
  return `feature/${name}`;
}

function branchExists(root: string, branch: string): boolean {
  return tryGit(root, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]).ok;
}

/** A porcelain entry is two status letters, a space, then the path. */
const ENTRY_HEAD = 3;

/**
 * Paths git reports as changed or untracked, outside the change directories,
 * which are process state. Read with `-z`, so a path with non-ASCII characters
 * comes back as written, and a rename gives its new and its old path.
 */
function dirtyPaths(root: string): string[] {
  const raw = readGit(root, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--",
    ".",
    `:(exclude)${CHANGES_DIRECTORY}`,
  ]);
  const parts = raw.split("\0");
  const paths: string[] = [];

  for (let index = 0; index < parts.length; index += 1) {
    const entry = parts[index]!;

    if (entry.length <= ENTRY_HEAD) {
      continue;
    }

    paths.push(entry.slice(ENTRY_HEAD));

    if ("RC".includes(entry[0]!) || "RC".includes(entry[1]!)) {
      index += 1;
      const origin = parts[index];

      if (origin) {
        paths.push(origin);
      }
    }
  }

  return paths;
}

/**
 * Runs every refusal of `openFeatureBranch` and writes nothing: the workspace
 * has to be a repository, the branch must not exist and the tree has to be
 * clean outside `lexforge/changes/`, and `dev` or `main` has to exist to
 * branch from.
 */
export function assertBranchable(root: string, name: string): void {
  if (!tryGit(root, ["rev-parse", "--show-toplevel"]).ok) {
    throw new UsageError(
      "not-a-git-repository",
      `${root} is not inside a git repository, so a change cannot get a feature branch.`,
      "git init, commit the project, then run this command again",
    );
  }

  const branch = featureBranchName(name);

  if (branchExists(root, branch)) {
    throw new UsageError(
      "feature-branch-exists",
      `the branch ${branch} already exists, so a new change named ${name} would collide with it.`,
      "pick another change name or delete the old branch",
    );
  }

  const dirty = dirtyPaths(root);

  if (dirty.length > 0) {
    throw new UsageError(
      "worktree-dirty",
      `the working tree has uncommitted changes: ${dirty.join(", ")}.`,
      "commit or stash them, then run this command again",
    );
  }

  if (!branchExists(root, DEV) && !branchExists(root, MAIN)) {
    throw new UsageError(
      "main-branch-missing",
      `the repository has neither ${DEV} nor ${MAIN}, so there is nothing to branch from.`,
      `create the branch ${DEV} or ${MAIN}, then run this command again`,
    );
  }
}

/**
 * Checks out `feature/<name>` made from `dev`, creating `dev` from `main`
 * first when it is absent. Refuses before it writes anything.
 */
export function openFeatureBranch(root: string, name: string): FeatureBranchResult {
  assertBranchable(root, name);

  const createdBranches: string[] = [];

  if (!branchExists(root, DEV)) {
    readGit(root, ["branch", DEV, MAIN]);
    createdBranches.push(DEV);
  }

  const branch = featureBranchName(name);
  readGit(root, ["checkout", "-b", branch, DEV]);
  createdBranches.push(branch);

  return { createdBranches };
}
