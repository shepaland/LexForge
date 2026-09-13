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

describe("parseTaskList: метка группы", () => {
  it("метка в квадратных скобках после номера — своё поле, номер и текст его не видят", () => {
    const tasks = parseTaskList(
      "- [ ] 3.1 [A] Write the failing prose test in `tests/x.test.ts`\n",
    );

    expect(tasks[0]!.number).toBe("3.1");
    expect(tasks[0]!.groups).toEqual(["A"]);
    expect(tasks[0]!.text).not.toContain("[A]");
    expect(tasks[0]!.text).toContain("Write the failing prose test");
  });

  it("строка без скобки после номера даёт пустой список меток", () => {
    const tasks = parseTaskList("- [ ] 3.2 Написать модуль без метки группы\n");

    expect(tasks[0]!.groups).toEqual([]);
  });

  it("номер и текст строки без метки разбираются так же, как до появления скобки", () => {
    const tasks = parseTaskList(PLAN);

    expect(tasks.map((task) => task.number)).toEqual(["1.1", "1.2", "2.1", "2.2"]);
    expect(tasks.map((task) => task.groups)).toEqual([[], [], [], []]);
    expect(tasks[0]!.text).toContain("Написать падающий тест");
    expect(tasks[0]!.text).not.toContain("1.1");
  });

  it("две метки подряд дают два элемента списка, а не один", () => {
    const tasks = parseTaskList("- [ ] 4.3 [A] [B] Write the implementation\n");

    expect(tasks[0]!.number).toBe("4.3");
    expect(tasks[0]!.groups).toEqual(["A", "B"]);
    expect(tasks[0]!.text).toBe("Write the implementation");
  });

  it("скобка длиннее восьми символов — не метка, а часть текста задачи", () => {
    const tasks = parseTaskList("- [ ] 4.5 [reference] task text follows here\n");

    expect(tasks[0]!.groups).toEqual([]);
    expect(tasks[0]!.text).toContain("[reference]");
    expect(tasks[0]!.text).toBe("[reference] task text follows here");
  });

  it("метка ровно из восьми символов распознаётся", () => {
    const tasks = parseTaskList("- [ ] 4.6 [abcdefgh] task text\n");

    expect(tasks[0]!.groups).toEqual(["abcdefgh"]);
    expect(tasks[0]!.text).toBe("task text");
  });

  it("скобка с пробелом внутри — не метка, остаётся в тексте задачи", () => {
    const tasks = parseTaskList("- [ ] 4.7 [a b] task text\n");

    expect(tasks[0]!.groups).toEqual([]);
    expect(tasks[0]!.text).toContain("[a b]");
  });

  it("отмеченная строка `- [x]` разбирает номер и метку так же, как незакрытая", () => {
    const tasks = parseTaskList("- [x] 1.3 [A] Write the failing prose test\n");

    expect(tasks[0]!.done).toBe(true);
    expect(tasks[0]!.number).toBe("1.3");
    expect(tasks[0]!.groups).toEqual(["A"]);
  });

  it("строка вовсе без номера оставляет номер пустым, а весь текст — в тексте задачи", () => {
    const tasks = parseTaskList("- [ ] Write the doc without a task number\n");

    expect(tasks[0]!.number).toBe("");
    expect(tasks[0]!.groups).toEqual([]);
    expect(tasks[0]!.text).toBe("Write the doc without a task number");
  });

  it("номер строки с меткой равен 3.1 без скобки и без хвостового пробела", () => {
    const tasks = parseTaskList("- [ ] 3.1 [A] Write the failing prose test\n");

    expect(tasks[0]!.number).toBe("3.1");
    expect(tasks[0]!.number).not.toContain("[");
    expect(tasks[0]!.number).not.toMatch(/\s$/);
  });
});
