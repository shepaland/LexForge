import { describe, expect, it } from "vitest";

import { parseTaskList } from "../../../src/core/gates/task-list.js";

describe("parseTaskList: пометка (move)", () => {
  it("пометка после метки группы даёт declaresMove и уходит из text, cleanText и firstLine", () => {
    const tasks = parseTaskList(
      "- [ ] 1.1 [P] (move) Перенести проверку в `src/x.ts`\n",
    );

    expect(tasks[0]!.declaresMove).toBe(true);
    expect(tasks[0]!.number).toBe("1.1");
    expect(tasks[0]!.groups).toEqual(["P"]);
    expect(tasks[0]!.text).not.toContain("(move)");
    expect(tasks[0]!.cleanText).not.toContain("(move)");
    expect(tasks[0]!.firstLine).not.toContain("(move)");
  });

  it("пометка перед номером не считается объявлением и не теряет номер", () => {
    const tasks = parseTaskList(
      "- [x] (move) 1.1 [P] Перенести проверку в `src/x.ts`\n",
    );

    expect(tasks[0]!.declaresMove).toBe(false);
    expect(tasks[0]!.number).toBe("1.1");
    expect(tasks[0]!.groups).toEqual(["P"]);
  });

  it("пометка между номером и меткой не считается объявлением и не теряет метку", () => {
    const tasks = parseTaskList(
      "- [x] 1.1 (move) [P] Перенести проверку в `src/x.ts`\n",
    );

    expect(tasks[0]!.declaresMove).toBe(false);
    expect(tasks[0]!.number).toBe("1.1");
    expect(tasks[0]!.groups).toEqual(["P"]);
  });

  it("пометка посреди текста задачи не считается объявлением", () => {
    const tasks = parseTaskList(
      "- [x] 1.1 [P] Перенести … `src/x.ts` (move) готово\n",
    );

    expect(tasks[0]!.declaresMove).toBe(false);
    expect(tasks[0]!.number).toBe("1.1");
    expect(tasks[0]!.groups).toEqual(["P"]);
  });

  it("задача без метки группы вовсе не даёт объявления, даже если (move) стоит первым словом", () => {
    const tasks = parseTaskList(
      "- [x] 1.1 (move) Перенести проверку в `src/x.ts`\n",
    );

    expect(tasks[0]!.declaresMove).toBe(false);
    expect(tasks[0]!.number).toBe("1.1");
    expect(tasks[0]!.groups).toEqual([]);
  });

  it("(MOVE) в верхнем регистре не считается объявлением", () => {
    const tasks = parseTaskList("- [x] 1.1 [P] (MOVE) текст\n");

    expect(tasks[0]!.declaresMove).toBe(false);
  });

  it("( move ) с пробелами внутри скобок не считается объявлением", () => {
    const tasks = parseTaskList("- [x] 1.1 [P] ( move ) текст\n");

    expect(tasks[0]!.declaresMove).toBe(false);
  });

  it("(moves) не считается объявлением", () => {
    const tasks = parseTaskList("- [x] 1.1 [P] (moves) текст\n");

    expect(tasks[0]!.declaresMove).toBe(false);
  });

  it("(move): без пробела после скобки не считается объявлением", () => {
    const tasks = parseTaskList("- [x] 1.1 [P] (move): текст\n");

    expect(tasks[0]!.declaresMove).toBe(false);
  });

  it("(move)text слитно с текстом не считается объявлением", () => {
    const tasks = parseTaskList("- [x] 1.1 [P] (move)text\n");

    expect(tasks[0]!.declaresMove).toBe(false);
  });

  it("задача без пометки вовсе даёт declaresMove в false", () => {
    const tasks = parseTaskList("- [x] 1.1 [P] Перенести проверку в `src/x.ts`\n");

    expect(tasks[0]!.declaresMove).toBe(false);
  });

  it("пометка перед номером и законная пометка после метки группы на одной строке: объявление засчитывается, неуместная пометка остаётся в тексте", () => {
    const tasks = parseTaskList(
      "- [ ] (move) 1.1 [A] (move) Перенести проверку в `src/x.ts`\n",
    );

    expect(tasks[0]!.declaresMove).toBe(true);
    expect(tasks[0]!.number).toBe("1.1");
    expect(tasks[0]!.groups).toEqual(["A"]);
    expect(tasks[0]!.text).toContain("(move)");
    expect(tasks[0]!.cleanText).toContain("(move)");
    expect(tasks[0]!.firstLine).toContain("(move)");
    expect(tasks[0]!.text.match(/\(move\)/g)).toHaveLength(1);
  });

  it("пометка между номером и меткой и законная пометка после метки группы на одной строке: объявление засчитывается, неуместная пометка остаётся в тексте", () => {
    const tasks = parseTaskList(
      "- [ ] 1.1 (move) [A] (move) Перенести проверку в `src/x.ts`\n",
    );

    expect(tasks[0]!.declaresMove).toBe(true);
    expect(tasks[0]!.number).toBe("1.1");
    expect(tasks[0]!.groups).toEqual(["A"]);
    expect(tasks[0]!.text).toContain("(move)");
    expect(tasks[0]!.cleanText).toContain("(move)");
    expect(tasks[0]!.firstLine).toContain("(move)");
    expect(tasks[0]!.text.match(/\(move\)/g)).toHaveLength(1);
  });
});
