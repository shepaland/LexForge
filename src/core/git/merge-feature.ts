import { UsageError } from "../../cli/errors.js";
import { featureBranchName } from "./feature-branch.js";
import { readGit, tryGit } from "./repository.js";

const DEV = "dev";

export interface MergeFeatureResult {
  /** False when the current branch is not the change's feature branch. */
  merged: boolean;
}

/**
 * Commits the pending work on `feature/<name>`, switches to `dev` and merges
 * the feature branch with `--no-ff`. The feature branch stays. On a conflict
 * the merge is aborted, the feature branch is checked out again and the
 * conflicting paths are listed. On any other branch nothing is touched.
 */
export function mergeFeature(root: string, name: string): MergeFeatureResult {
  const branch = featureBranchName(name);

  if (readGit(root, ["branch", "--show-current"]) !== branch) {
    return { merged: false };
  }

  readGit(root, ["add", "--all"]);

  if (tryGit(root, ["diff", "--cached", "--quiet"]).ok === false) {
    readGit(root, ["commit", "--message", `Complete ${name}`]);
  }

  readGit(root, ["checkout", DEV]);

  const merge = tryGit(root, ["merge", "--no-ff", "--message", `Merge ${branch}`, branch]);

  if (merge.ok) {
    return { merged: true };
  }

  const conflicts = readGit(root, ["diff", "--name-only", "--diff-filter=U"])
    .split("\n")
    .filter((path) => path.length > 0);

  readGit(root, ["merge", "--abort"]);
  readGit(root, ["checkout", branch]);

  throw new UsageError(
    "merge-conflict",
    `merging ${branch} into ${DEV} conflicts in: ${conflicts.join(", ")}. The merge was aborted ` +
      `and ${branch} is checked out again.`,
    `resolve the conflict between ${DEV} and ${branch}, then run this command again`,
  );
}
