import { readFileSync, rmSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { worktreeDigest } from "../../../src/core/git/worktree-digest.js";
import { createGitWorkspace, writeAt, type GitWorkspace } from "../../helpers/git-workspace.js";

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

describe("worktreeDigest", () => {
  it("на чистом дереве даёт одно и то же значение", () => {
    const workspace = keep(createGitWorkspace());

    const first = worktreeDigest(workspace.root);
    const second = worktreeDigest(workspace.root);

    expect(first).toBe(second);
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("правка файла меняет значение, возврат текста его возвращает", () => {
    const workspace = keep(createGitWorkspace());
    const clean = worktreeDigest(workspace.root);
    const before = readFileSync(path.join(workspace.root, "src/app.ts"), "utf8");

    writeAt(workspace.root, "src/app.ts", `${before}// one more line\n`);
    const edited = worktreeDigest(workspace.root);

    expect(edited).not.toBe(clean);

    writeAt(workspace.root, "src/app.ts", before);

    expect(worktreeDigest(workspace.root)).toBe(clean);
  });

  it("новый неотслеживаемый файл меняет значение", () => {
    const workspace = keep(createGitWorkspace());
    const clean = worktreeDigest(workspace.root);

    writeAt(workspace.root, "src/extra.ts", "export const extra = 1;\n");

    expect(worktreeDigest(workspace.root)).not.toBe(clean);
  });

  it("запись в lexforge отпечаток не меняет, а README.md меняет", () => {
    const workspace = keep(createGitWorkspace());
    const clean = worktreeDigest(workspace.root);

    writeAt(workspace.root, "lexforge/changes/add-auth/evidence.json", '{"outputVersion":1}\n');

    expect(worktreeDigest(workspace.root)).toBe(clean);

    writeAt(workspace.root, "README.md", "# project\n");

    expect(worktreeDigest(workspace.root)).not.toBe(clean);
  });

  it("удаление файла меняет значение", () => {
    const workspace = keep(createGitWorkspace());
    const clean = worktreeDigest(workspace.root);

    rmSync(path.join(workspace.root, "src/app.ts"));

    expect(worktreeDigest(workspace.root)).not.toBe(clean);
  });
});
