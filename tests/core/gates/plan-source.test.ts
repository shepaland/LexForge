import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readPlanSource } from "../../../src/core/gates/plan-source.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    removeWorkspace(roots.pop()!);
  }
});

function workspace(files: Record<string, string>): string {
  const root = makeWorkspace(files);
  roots.push(root);
  return root;
}

const WHOLE_FILE_PLAN = [
  "## 1. Раздел целиком",
  "Depends on: none",
  "",
  "- [ ] 1.1 Сделать штуку `src/thing.ts`",
  "- [x] 1.2 Прогнать тест `tests/thing.test.ts`",
  "",
].join("\n");

const INDEX_PLAN = [
  "## 1. Первый раздел",
  "`tasks/01-first.md`",
  "",
  "## 2. Второй раздел",
  "`tasks/02-second.md`",
  "",
].join("\n");

const FIRST_SECTION_FILE = [
  "Depends on: none",
  "",
  "- [ ] 1.1 Написать тест `tests/one.test.ts`",
  "- [x] 1.2 Прогнать тест и увидеть падение",
  "",
].join("\n");

const SECOND_SECTION_FILE = [
  "Depends on: section 1",
  "",
  "- [ ] 2.1 Сделать штуку `src/two.ts`",
  "",
].join("\n");

describe("readPlanSource", () => {
  it("читает раздел целиком так же, как читают его сегодня parseTaskList и parseSections", () => {
    const root = workspace({ "tasks.md": WHOLE_FILE_PLAN });
    const file = path.join(root, "tasks.md");

    const { tasks, sections } = readPlanSource(file);

    expect(tasks).toHaveLength(2);
    expect(tasks.map((task) => task.number)).toEqual(["1.1", "1.2"]);
    expect(tasks.map((task) => task.line)).toEqual([4, 5]);
    expect(tasks.every((task) => task.file === file)).toBe(true);

    expect(sections).toHaveLength(1);
    const [section] = sections;
    expect(section!.number).toBe("1");
    expect(section!.headingLine).toBe(1);
    expect(section!.dependsOnLine).toBe(2);
    expect(section!.dependsOn).toEqual([]);
    expect(section!.tasks.map((task) => task.number)).toEqual(["1.1", "1.2"]);
    expect(section!.file).toBe(file);
    expect(section!.headingFile).toBe(file);
  });

  it("читает индекс ссылок: задачи и Depends on: считаются из связанного файла, headingLine остаётся на индексе", () => {
    const root = workspace({
      "tasks.md": INDEX_PLAN,
      "tasks/01-first.md": FIRST_SECTION_FILE,
      "tasks/02-second.md": SECOND_SECTION_FILE,
    });
    const indexFile = path.join(root, "tasks.md");
    const firstFile = path.join(root, "tasks", "01-first.md");
    const secondFile = path.join(root, "tasks", "02-second.md");

    const { tasks, sections } = readPlanSource(indexFile);

    expect(tasks.map((task) => task.number)).toEqual(["1.1", "1.2", "2.1"]);
    expect(tasks.filter((task) => task.number.startsWith("1.")).every((task) => task.file === firstFile)).toBe(
      true,
    );
    expect(tasks.find((task) => task.number === "2.1")!.file).toBe(secondFile);
    // Line numbers count from the linked file, not from the index.
    expect(tasks.find((task) => task.number === "1.1")!.line).toBe(3);
    expect(tasks.find((task) => task.number === "2.1")!.line).toBe(3);

    expect(sections).toHaveLength(2);
    const [first, second] = sections;

    expect(first!.number).toBe("1");
    expect(first!.headingLine).toBe(1); // stays on the index heading
    expect(first!.headingFile).toBe(indexFile);
    expect(first!.file).toBe(firstFile);
    expect(first!.dependsOnLine).toBe(1); // local to the linked file
    expect(first!.dependsOn).toEqual([]);
    expect(first!.tasks.map((task) => task.number)).toEqual(["1.1", "1.2"]);

    expect(second!.number).toBe("2");
    expect(second!.headingLine).toBe(4);
    expect(second!.headingFile).toBe(indexFile);
    expect(second!.file).toBe(secondFile);
    expect(second!.dependsOnLine).toBe(1);
    expect(second!.dependsOn).toEqual(["1"]);
    expect(second!.tasks.map((task) => task.number)).toEqual(["2.1"]);
  });
});
