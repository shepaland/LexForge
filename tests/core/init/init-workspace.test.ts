import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import { initWorkspace } from "../../../src/core/init/init-workspace.js";
import { readProjectConfig } from "../../../src/core/workspace/project-config.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const created: string[] = [];

function project(files: Record<string, string> = {}): string {
  const root = makeWorkspace(files);
  created.push(root);
  return root;
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

describe("initWorkspace, первый запуск", () => {
  it("создаёт config.yaml, specs/ и changes/archive/ и даёт код 0", () => {
    const root = project();

    const result = initWorkspace({ cwd: root });

    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(root, "lexforge/config.yaml"))).toBe(true);
    expect(statSync(path.join(root, "lexforge/specs")).isDirectory()).toBe(true);
    expect(statSync(path.join(root, "lexforge/changes/archive")).isDirectory()).toBe(true);
  });

  it("называет каждый созданный путь в строках вывода", () => {
    const root = project();

    const result = initWorkspace({ cwd: root });
    const text = result.lines.join("\n");

    for (const relative of ["lexforge/config.yaml", "lexforge/specs", "lexforge/changes/archive"]) {
      expect(text).toContain(path.join(root, relative));
    }
    expect(result.data.created).toEqual(
      expect.arrayContaining([path.join(root, "lexforge/config.yaml")]),
    );
  });

  it("написанный config.yaml читается со схемой по умолчанию и невыбранным языком", () => {
    const root = project();

    initWorkspace({ cwd: root });
    const config = readProjectConfig(root);

    expect(config.schema).toBe("spec-driven");
    expect(config.languageExplicit).toBe(false);
  });
});

const HAND_WRITTEN_CONFIG = "schema: bounded\ncontext: a project someone already set up\n";

describe("initWorkspace, повторный запуск", () => {
  it("оставляет config.yaml побайтно прежним и досоздаёт недостающий каталог", () => {
    const root = project({
      "lexforge/config.yaml": HAND_WRITTEN_CONFIG,
      "lexforge/changes/archive/": "",
    });

    const result = initWorkspace({ cwd: root });

    expect(result.exitCode).toBe(0);
    expect(readFileSync(path.join(root, "lexforge/config.yaml"), "utf8")).toBe(HAND_WRITTEN_CONFIG);
    expect(statSync(path.join(root, "lexforge/specs")).isDirectory()).toBe(true);
    expect(result.data.created).toEqual([path.join(root, "lexforge/specs")]);
    expect(result.data.unchanged).toEqual(
      expect.arrayContaining([
        path.join(root, "lexforge/config.yaml"),
        path.join(root, "lexforge/changes/archive"),
      ]),
    );
  });

  it("печатает две группы строк: что создано и что оставлено нетронутым", () => {
    const root = project({
      "lexforge/config.yaml": HAND_WRITTEN_CONFIG,
      "lexforge/changes/archive/": "",
    });

    const text = initWorkspace({ cwd: root }).lines.join("\n");

    expect(text).toContain("Created:");
    expect(text).toContain("Left as is:");
    expect(text).toContain(path.join(root, "lexforge/specs"));
    expect(text).toContain(path.join(root, "lexforge/config.yaml"));
  });
});

describe("initWorkspace, выбор языка", () => {
  it("без флага не пишет поле language", () => {
    const root = project();

    initWorkspace({ cwd: root });

    expect(readFileSync(path.join(root, "lexforge/config.yaml"), "utf8")).not.toMatch(
      /^language:/m,
    );
  });

  it("с флагом пишет language и делает выбор явным", () => {
    const root = project();

    initWorkspace({ cwd: root, language: "ru" });

    expect(readFileSync(path.join(root, "lexforge/config.yaml"), "utf8")).toMatch(
      /^language: ru$/m,
    );
    expect(readProjectConfig(root).languageExplicit).toBe(true);
    expect(readProjectConfig(root).language).toBe("ru");
  });
});

const SKILLS_DIR = fileURLToPath(new URL("../../fixtures/skills", import.meta.url));

describe("initWorkspace, установка скиллов", () => {
  it("пишет каждый скилл в каталог инструмента и называет путь в выводе", () => {
    const root = project();

    const result = initWorkspace({ cwd: root, tools: ["claude"], skillsDir: SKILLS_DIR });
    const skill = path.join(root, ".claude/skills/sample-plan/SKILL.md");

    expect(result.exitCode).toBe(0);
    expect(readFileSync(skill, "utf8")).toContain("sample-plan");
    expect(result.data.created).toEqual(expect.arrayContaining([skill]));
    expect(result.lines.join("\n")).toContain(skill);
  });

  it("неизвестный инструмент не даёт записать ни одного файла", () => {
    const root = project();

    let caught: unknown;
    try {
      initWorkspace({ cwd: root, tools: ["claude", "nosuch"], skillsDir: SKILLS_DIR });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(UsageError);
    expect((caught as UsageError).code).toBe("tool-unknown");
    expect(existsSync(path.join(root, ".claude"))).toBe(false);
    expect(existsSync(path.join(root, "lexforge"))).toBe(false);
  });
});
