import { execFileSync } from "node:child_process";
import { mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { makeWorkspace, removeWorkspace } from "./workspace.js";

/** Identity of the test commits. Without it git refuses to commit on a bare machine. */
const IDENTITY = [
  "-c",
  "user.name=LexForge Test",
  "-c",
  "user.email=test@example.com",
  "-c",
  "commit.gpgsign=false",
];

const CONFIG = `schema: spec-driven
verification:
  tests: npm test
  lint: npm run lint
`;

const APP = `export function app(): string {
  return "app";
}
`;

export interface GitWorkspace {
  /** Project root, resolved through symlinks: git prints the real path. */
  root: string;
  /** The commit the helper made. */
  head: string;
  remove(): void;
}

/** Runs git in the given directory and returns its output with the trailing newline dropped. */
export function git(root: string, ...args: string[]): string {
  return execFileSync("git", [...IDENTITY, ...args], {
    cwd: root,
    encoding: "utf8",
  }).trimEnd();
}

/** Writes a file under the root, making the directories on the way. */
export function writeAt(root: string, relative: string, content: string): void {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

/** Stages everything and commits it. Returns the new commit. */
export function commitAll(root: string, message: string): string {
  git(root, "add", "--all");
  git(root, "commit", "--message", message);
  return git(root, "rev-parse", "HEAD");
}

/**
 * A throwaway project inside a git repository: `lexforge/config.yaml` with two
 * check labels, one source file, one commit. Extra files are laid out before
 * the commit, so a change directory can be committed with it.
 */
export function createGitWorkspace(files: Record<string, string> = {}): GitWorkspace {
  const root = realpathSync(
    makeWorkspace({
      "lexforge/config.yaml": CONFIG,
      "src/app.ts": APP,
      ...files,
    }),
  );

  git(root, "init", "--initial-branch=main");
  const head = commitAll(root, "first commit");

  return {
    root,
    head,
    remove: () => removeWorkspace(root),
  };
}

/** A temp directory with the same layout and no repository at all. */
export function createPlainWorkspace(files: Record<string, string> = {}): GitWorkspace {
  const root = realpathSync(
    makeWorkspace({
      "lexforge/config.yaml": CONFIG,
      "src/app.ts": APP,
      ...files,
    }),
  );

  return {
    root,
    head: "",
    remove: () => rmSync(root, { recursive: true, force: true }),
  };
}
