import { describe, expect, it } from "vitest";

import { parseTaskList } from "../../../src/core/gates/task-list.js";

const PLAN = [
  "## 1. Разбор плана",
  "",
  "- [ ] 1.1 Написать падающий тест `tests/core/gates/task-list.test.ts` на список задач",
  "- [x] 1.2 Прогнать тест и увидеть падение: модуля разбора плана ещё нет",
  "",
  "## 2. Правила самопроверки",
  "",
  "- [ ] 2.1 Написать модуль `src/core/gates/placeholder-rules.ts` со списком маркеров",
  "- [X] 2.2 Прогнать тест и увидеть, что он проходит",
  "",
].join("\n");

describe("parseTaskList", () => {
  it("находит четыре задачи и не считает задачей строку раздела", () => {
    const tasks = parseTaskList(PLAN);

    expect(tasks.map((task) => task.number)).toEqual(["1.1", "1.2", "2.1", "2.2"]);
    expect(tasks.map((task) => task.line)).toEqual([3, 4, 8, 9]);
    expect(tasks.map((task) => task.done)).toEqual([false, true, false, true]);
    expect(tasks[0]!.text).toContain("Написать падающий тест");
    expect(tasks[0]!.text).not.toContain("1.1");
  });

  it("отметка закрытия читается в любом регистре", () => {
    const tasks = parseTaskList(
      [
        "- [ ] 1.1 Написать разбор списка задач и покрыть его тестом",
        "- [x] 1.2 Прогнать тест и увидеть, что он проходит",
        "- [X] 1.3 Прогнать сборку и увидеть, что она проходит",
      ].join("\n"),
    );

    expect(tasks.map((task) => task.done)).toEqual([false, true, true]);
  });

  it("задача из трёх строк даёт один элемент с текстом через пробел", () => {
    const tasks = parseTaskList(
      [
        "## 1. Раздел",
        "",
        "- [ ] 1.1 Написать падающий тест на список задач",
        "      и прогнать его в каталоге `tests/core/gates`,",
        "      увидев падение своими глазами",
        "- [ ] 1.2 Написать разбор строки задачи",
      ].join("\n"),
    );

    expect(tasks).toHaveLength(2);
    expect(tasks[0]!.line).toBe(3);
    expect(tasks[0]!.text).toBe(
      "Написать падающий тест на список задач и прогнать его в каталоге " +
        "`tests/core/gates`, увидев падение своими глазами",
    );
  });
});

describe("parseTaskList: ссылки на требования", () => {
  it("строка со стрелкой даёт разобранные путь и имя требования", () => {
    const tasks = parseTaskList(
      [
        "- [ ] 1.1 Написать разбор ссылки в `src/core/gates/task-list.ts`",
        "      -> plan-selfcheck#Каждое требование дельты названо задачей",
      ].join("\n"),
    );

    expect(tasks[0]!.links).toEqual([
      { capability: "plan-selfcheck", requirement: "Каждое требование дельты названо задачей" },
    ]);
  });

  it("две ссылки на разных строках дают два элемента", () => {
    const tasks = parseTaskList(
      [
        "- [ ] 1.1 Написать разбор ссылки в `src/core/gates/task-list.ts`",
        "      -> plan-selfcheck#Каждое требование дельты названо задачей",
        "      -> gate-command-contract#Четыре команды-ворота",
      ].join("\n"),
    );

    expect(tasks[0]!.links).toEqual([
      { capability: "plan-selfcheck", requirement: "Каждое требование дельты названо задачей" },
      { capability: "gate-command-contract", requirement: "Четыре команды-ворота" },
    ]);
  });

  it("строка без стрелки ссылок не даёт", () => {
    const tasks = parseTaskList(
      "- [ ] 1.1 Написать разбор ссылки в `src/core/gates/task-list.ts` и прогнать тест\n",
    );

    expect(tasks[0]!.links).toEqual([]);
  });
});

describe("parseTaskList: имена файлов", () => {
  it("пути берутся из вставок в обратных кавычках", () => {
    const tasks = parseTaskList(
      [
        "- [ ] 1.1 Написать `src/core/gates/task-list.ts`, дописать `README.md`",
        "      и прогнать `npm test`; файл config.yaml без кавычек путём не считается",
      ].join("\n"),
    );

    expect(tasks[0]!.files).toEqual(["src/core/gates/task-list.ts", "README.md"]);
  });
});

describe("parseTaskList: текст без служебных частей", () => {
  it("номера и ссылки на требование в очищенный текст не входят", () => {
    const tasks = parseTaskList(
      [
        "- [ ] 3.4 Написать разбор ссылки в `src/core/gates/task-list.ts`",
        "      -> plan-selfcheck#Каждое требование дельты названо задачей",
      ].join("\n"),
    );

    expect(tasks[0]!.cleanText).toBe("Написать разбор ссылки в `src/core/gates/task-list.ts`");
    expect(tasks[0]!.cleanText).not.toContain("3.4");
    expect(tasks[0]!.cleanText).not.toContain("plan-selfcheck");
  });

  it("ссылка в конце строки с текстом убирает только себя", () => {
    const tasks = parseTaskList(
      "- [ ] 3.5 Прогнать тест `npm test` -> plan-selfcheck#Находка называет место\n",
    );

    expect(tasks[0]!.cleanText).toBe("Прогнать тест `npm test`");
  });
});
