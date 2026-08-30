import { afterEach, describe, expect, it } from "vitest";

import { changeBase, changedFiles } from "../../../src/core/git/change-base.js";
import {
  commitAll,
  createGitWorkspace,
  writeAt,
  type GitWorkspace,
} from "../../helpers/git-workspace.js";

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

describe("changeBase", () => {
  it("отдаёт коммит, которым каталог change попал в репозиторий", () => {
    const workspace = keep(createGitWorkspace());

    writeAt(workspace.root, "lexforge/changes/add-auth/.lexforge.yaml", "schema: spec-driven\n");
    const added = commitAll(workspace.root, "add-auth planned");

    writeAt(workspace.root, "src/app.ts", "export const app = 2;\n");
    commitAll(workspace.root, "work on add-auth");

    expect(changeBase(workspace.root, "add-auth")).toBe(added);
  });

  it("для незакоммиченного каталога отдаёт текущий коммит", () => {
    const workspace = keep(createGitWorkspace());

    writeAt(workspace.root, "lexforge/changes/add-auth/.lexforge.yaml", "schema: spec-driven\n");

    expect(changeBase(workspace.root, "add-auth")).toBe(workspace.head);
  });
});

describe("changedFiles", () => {
  it("собирает правку отслеживаемого файла и новый неотслеживаемый файл", () => {
    const workspace = keep(createGitWorkspace());
    const base = workspace.head;

    writeAt(workspace.root, "src/app.ts", "export const app = 2;\n");
    commitAll(workspace.root, "edit app");
    writeAt(workspace.root, "src/extra.ts", "export const extra = 1;\n");

    expect(changedFiles(workspace.root, base).sort()).toEqual(["src/app.ts", "src/extra.ts"]);
  });

  it("каталог lexforge в список не попадает", () => {
    const workspace = keep(createGitWorkspace());
    const base = workspace.head;

    writeAt(workspace.root, "lexforge/changes/add-auth/tasks.md", "# tasks\n");
    writeAt(workspace.root, "src/app.ts", "export const app = 3;\n");

    expect(changedFiles(workspace.root, base)).toEqual(["src/app.ts"]);
  });
});
