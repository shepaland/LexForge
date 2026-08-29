import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { probeFilled } from "../../../src/core/artifact-graph/probe-filled.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const created: string[] = [];

function changeDir(files: Record<string, string>): string {
  const prefixed = Object.fromEntries(
    Object.entries(files).map(([relative, content]) => [
      `lexforge/changes/add-auth/${relative}`,
      content,
    ]),
  );
  const root = makeWorkspace({ "lexforge/config.yaml": "schema: spec-driven\n", ...prefixed });
  created.push(root);
  return path.join(root, "lexforge", "changes", "add-auth");
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

describe("probeFilled на одном файле", () => {
  it("файл с текстом заполнен", () => {
    expect(probeFilled(changeDir({ "proposal.md": "## Why\n\nBecause.\n" }), "proposal.md")).toBe(
      true,
    );
  });

  it("файл нулевого размера не заполнен", () => {
    expect(probeFilled(changeDir({ "proposal.md": "" }), "proposal.md")).toBe(false);
  });

  it("файл из пробелов и переводов строки не заполнен", () => {
    expect(probeFilled(changeDir({ "proposal.md": "   \n\n\t\n" }), "proposal.md")).toBe(false);
  });

  it("отсутствующий файл не заполнен", () => {
    expect(probeFilled(changeDir({}), "proposal.md")).toBe(false);
  });
});

describe("probeFilled на наборе файлов", () => {
  it("каталог без файлов нужного расширения не заполнен", () => {
    expect(probeFilled(changeDir({ "specs/notes.txt": "text" }), "specs/**/*.md")).toBe(false);
  });

  it("один непустой файл во вложенной папке заполняет артефакт", () => {
    expect(
      probeFilled(
        changeDir({ "specs/identity/user-auth/spec.md": "## Purpose\n\nAuth.\n" }),
        "specs/**/*.md",
      ),
    ).toBe(true);
  });

  it("единственный пустой файл артефакт не заполняет", () => {
    expect(probeFilled(changeDir({ "specs/identity/spec.md": "\n \n" }), "specs/**/*.md")).toBe(
      false,
    );
  });

  it("отсутствующий каталог не заполнен", () => {
    expect(probeFilled(changeDir({}), "specs/**/*.md")).toBe(false);
  });
});
