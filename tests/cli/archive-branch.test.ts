import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { git, commitAll, writeAt } from "../helpers/git-workspace.js";
import {
  CHANGE,
  CLOSED_PLAN,
  call,
  changeFiles,
  created,
  editApp,
  recordRed,
  workspace,
  type ArchiveDocument,
} from "./archive-fixtures.js";

const MERGED = "\nArchive does not merge into dev\n";

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

/** A change that passes every check, on feature/add-auth cut from dev. */
async function featureWorkspace(beforeEdit?: (root: string) => void): Promise<string> {
  const files = {
    ...changeFiles(CLOSED_PLAN),
    [`lexforge/changes/${CHANGE}/specs/auth/mockups/login.html`]: "<form></form>\n",
    [`lexforge/changes/${CHANGE}/specs/auth/mockups/login.css`]: ".login { color: red; }\n",
  };
  const root = workspace(files).root;

  git(root, "branch", "dev");
  git(root, "checkout", "-b", `feature/${CHANGE}`);
  beforeEdit?.(root);
  editApp(root);
  await recordRed(root);
  await call(["evidence", "record", "--change", CHANGE, "--label", "tests"], root);
  return root;
}

describe("lexforge archive on a feature branch", () => {
  it("merges the feature branch into dev and asks whether dev goes to main", async () => {
    const root = await featureWorkspace();

    const { exitCode, capture } = await call(["archive", CHANGE, "--json"], root);
    const answer = JSON.parse(capture.out) as ArchiveDocument & { merged?: boolean };

    expect(exitCode, capture.err).toBe(0);
    expect(git(root, "log", "dev", "--merges", "--format=%s"), MERGED).toBe(
      `Merge feature/${CHANGE}`,
    );
    expect(git(root, "rev-parse", "dev^2"), MERGED).toBe(git(root, "rev-parse", `feature/${CHANGE}`));
    expect(git(root, "branch", "--list", `feature/${CHANGE}`)).toContain(`feature/${CHANGE}`);
    expect(git(root, "rev-parse", "main")).toBe(git(root, "rev-list", "--max-parents=0", "main"));
    expect(answer.merged).toBe(true);
    expect(answer.nextStep).toMatch(/merge dev into main/);
  });

  it("copies the mockups of the change into the main specs", async () => {
    const root = await featureWorkspace();

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    expect(exitCode, capture.err).toBe(0);
    expect(readFileSync(path.join(root, "lexforge/specs/auth/mockups/login.css"), "utf8")).toBe(
      ".login { color: red; }\n",
    );
    expect(existsSync(path.join(root, "lexforge/specs/auth/mockups/login.html"))).toBe(true);
  });

  it("exits 1 on a conflict, lists the paths and leaves the feature branch checked out", async () => {
    const root = await featureWorkspace(() => undefined);
    git(root, "stash", "--include-untracked");
    git(root, "checkout", "dev");
    writeAt(root, "src/app.ts", 'export function app(): string {\n  return "dev";\n}\n');
    commitAll(root, "dev edits app");
    git(root, "checkout", `feature/${CHANGE}`);
    git(root, "stash", "pop");

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    expect(exitCode, MERGED).toBe(1);
    expect(capture.out + capture.err).toContain("src/app.ts");
    expect(git(root, "branch", "--show-current")).toBe(`feature/${CHANGE}`);
    expect(git(root, "status", "--porcelain")).toBe("");
  });

  it("carries each conflicting path as a finding under --json", async () => {
    const root = await featureWorkspace(() => undefined);
    git(root, "stash", "--include-untracked");
    git(root, "checkout", "dev");
    writeAt(root, "src/app.ts", 'export function app(): string {\n  return "dev";\n}\n');
    commitAll(root, "dev edits app");
    git(root, "checkout", `feature/${CHANGE}`);
    git(root, "stash", "pop");

    const { exitCode, capture } = await call(["archive", CHANGE, "--json"], root);
    const answer = JSON.parse(capture.out) as ArchiveDocument & {
      findings: { file: string; rule: string }[];
      nextStep: string;
    };

    expect(exitCode, MERGED).toBe(1);
    expect(answer.findings.map((f) => `${f.file} ${f.rule}`)).toEqual(["src/app.ts merge-conflict"]);
    expect(answer.nextStep).toMatch(/git merge feature\//);
    expect(answer.nextStep).not.toMatch(/run this command again/);
  });
});

describe("lexforge archive outside a feature branch", () => {
  it("archives without a merge and says the merge was skipped", async () => {
    const root = await featureWorkspace();
    git(root, "stash", "--include-untracked");
    git(root, "checkout", "main");
    git(root, "stash", "pop");

    const { exitCode, capture } = await call(["archive", CHANGE, "--json"], root);
    const answer = JSON.parse(capture.out) as ArchiveDocument & { merged?: boolean };

    expect(exitCode, capture.err).toBe(0);
    expect(answer.merged, MERGED).toBe(false);
    expect(answer.nextStep).toMatch(/not built on its feature branch/);
    expect(git(root, "log", "dev", "--merges", "--format=%s")).toBe("");
  });
});
