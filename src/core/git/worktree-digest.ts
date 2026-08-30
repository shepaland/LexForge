import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { WORKSPACE_DIR } from "../workspace/paths.js";
import { readGit } from "./repository.js";

/** Prefix of the digest, so the algorithm is readable in `evidence.json`. */
const PREFIX = "sha256:";

/**
 * Stands in for the content of a file that is gone. A deleted file has no
 * bytes to hash, and leaving it out would make a deletion invisible.
 */
const DELETED = "<deleted>";

/** A porcelain entry is two status letters, a space, then the path. */
const ENTRY_HEAD = 3;

/**
 * The state of the working tree in one string. Only the paths git reports as
 * changed or untracked are hashed: the repository already knows what moved,
 * and the list stays short even in a large project.
 *
 * The `lexforge/` directory is left out. Recording an evidence stamp rewrites
 * `lexforge/changes/<name>/evidence.json`, and a digest counting that file
 * would make every run stale the moment it finished.
 */
export function worktreeDigest(root: string): string {
  const top = readGit(root, ["rev-parse", "--show-toplevel"]);
  const raw = readGit(root, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--",
    ".",
    `:(exclude)${WORKSPACE_DIR}`,
  ]);

  const digest = createHash("sha256");

  for (const relative of changedPaths(raw)) {
    digest.update(relative);
    digest.update("\0");
    digest.update(fileDigest(path.join(top, relative)));
    digest.update("\n");
  }

  return PREFIX + digest.digest("hex");
}

/**
 * Paths out of `status --porcelain=v1 -z`, sorted. A rename is written as two
 * records, the new path and the old one, so both are taken: the old path is
 * gone from the tree and that counts as a change too.
 */
function changedPaths(raw: string): string[] {
  const parts = raw.split("\0");
  const paths = new Set<string>();

  for (let index = 0; index < parts.length; index += 1) {
    const entry = parts[index]!;
    if (entry.length <= ENTRY_HEAD) {
      continue;
    }

    paths.add(entry.slice(ENTRY_HEAD));

    if (isRename(entry[0]!) || isRename(entry[1]!)) {
      index += 1;
      const origin = parts[index];
      if (origin) {
        paths.add(origin);
      }
    }
  }

  return [...paths].sort();
}

function isRename(letter: string): boolean {
  return letter === "R" || letter === "C";
}

function fileDigest(file: string): string {
  try {
    return createHash("sha256").update(readFileSync(file)).digest("hex");
  } catch {
    return DELETED;
  }
}
