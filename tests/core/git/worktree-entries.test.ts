import { createHash } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import * as digestModule from "../../../src/core/git/worktree-digest.js";
import { createGitWorkspace, writeAt, type GitWorkspace } from "../../helpers/git-workspace.js";

type Entries = (root: string, exclude?: string[]) => Record<string, string>;

const created: GitWorkspace[] = [];

function workspace(): GitWorkspace {
  const made = createGitWorkspace({ "a.txt": "one\n" });
  created.push(made);
  return made;
}

function entriesOf(): Entries {
  const found = (digestModule as { worktreeEntries?: Entries }).worktreeEntries;
  expect(typeof found, "\nworktreeEntries is not implemented\n").toBe("function");
  return found!;
}

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

describe("worktreeEntries", () => {
  it("maps an edited file and an untracked file to content hashes", () => {
    const made = workspace();
    writeAt(made.root, "a.txt", "two\n");
    writeAt(made.root, "scripts/tmp.sh", "echo hi\n");

    const entries = entriesOf()(made.root, []);

    expect(Object.keys(entries).sort()).toEqual(["a.txt", "scripts/tmp.sh"]);
    expect(entries["a.txt"]).toMatch(/^[0-9a-f]{64}$/);
    expect(entries["scripts/tmp.sh"]).toBe(createHash("sha256").update("echo hi\n").digest("hex"));
  });

  it("omits paths under lexforge/", () => {
    const made = workspace();
    writeAt(made.root, "lexforge/changes/x/evidence.json", "{}\n");
    writeAt(made.root, "scripts/tmp.sh", "echo hi\n");

    expect(Object.keys(entriesOf()(made.root, []))).toEqual(["scripts/tmp.sh"]);
  });

  it("omits every path passed in exclude", () => {
    const made = workspace();
    writeAt(made.root, "a.txt", "two\n");
    writeAt(made.root, "scripts/tmp.sh", "echo hi\n");

    expect(Object.keys(entriesOf()(made.root, ["scripts/tmp.sh"]))).toEqual(["a.txt"]);
  });

  it("gives an empty record on a clean tree", () => {
    expect(entriesOf()(workspace().root, [])).toEqual({});
  });

  it("keeps worktreeDigest equal to the hash of the sorted entries", () => {
    const made = workspace();
    writeAt(made.root, "a.txt", "two\n");
    writeAt(made.root, "scripts/tmp.sh", "echo hi\n");

    const entries = entriesOf()(made.root, []);
    const hash = createHash("sha256");
    for (const key of Object.keys(entries).sort()) {
      hash.update(`${key}\0${entries[key]}\n`);
    }

    expect(digestModule.worktreeDigest(made.root, [])).toBe(`sha256:${hash.digest("hex")}`);
  });
});
