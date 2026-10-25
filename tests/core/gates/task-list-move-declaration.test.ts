import { describe, expect, it } from "vitest";

import { parseTaskList } from "../../../src/core/gates/task-list.js";

describe("parseTaskList: пометка (move)", () => {
  it("пометка сразу после номера даёт declaresMove и уходит из text, cleanText и firstLine", () => {
    const tasks = parseTaskList("- [ ] 1.1 (move) Перенести проверку в `src/x.ts`\n");

    expect(tasks[0]!.declaresMove).toBe(true);
    expect(tasks[0]!.number).toBe("1.1");
    expect(tasks[0]!.text).not.toContain("(move)");
    expect(tasks[0]!.cleanText).not.toContain("(move)");
    expect(tasks[0]!.firstLine).not.toContain("(move)");
  });

  it("пометка перед номером не считается объявлением и не теряет номер", () => {
    const tasks = parseTaskList("- [x] (move) 1.1 Перенести проверку в `src/x.ts`\n");

    expect(tasks[0]!.declaresMove).toBe(false);
    expect(tasks[0]!.number).toBe("1.1");
    expect(tasks[0]!.text).toContain("(move)");
  });

  it("пометка посреди текста задачи не считается объявлением", () => {
    const tasks = parseTaskList("- [x] 1.1 Перенести … `src/x.ts` (move) готово\n");

    expect(tasks[0]!.declaresMove).toBe(false);
    expect(tasks[0]!.number).toBe("1.1");
  });

  it("(MOVE) в верхнем регистре не считается объявлением", () => {
    expect(parseTaskList("- [x] 1.1 (MOVE) текст\n")[0]!.declaresMove).toBe(false);
  });

  it("( move ) с пробелами внутри скобок не считается объявлением", () => {
    expect(parseTaskList("- [x] 1.1 ( move ) текст\n")[0]!.declaresMove).toBe(false);
  });

  it("(moves) не считается объявлением", () => {
    expect(parseTaskList("- [x] 1.1 (moves) текст\n")[0]!.declaresMove).toBe(false);
  });

  it("(move): без пробела после скобки не считается объявлением", () => {
    expect(parseTaskList("- [x] 1.1 (move): текст\n")[0]!.declaresMove).toBe(false);
  });

  it("(move)text слитно с текстом не считается объявлением", () => {
    expect(parseTaskList("- [x] 1.1 (move)text\n")[0]!.declaresMove).toBe(false);
  });

  it("задача без пометки даёт declaresMove в false", () => {
    expect(
      parseTaskList("- [x] 1.1 Перенести проверку в `src/x.ts`\n")[0]!.declaresMove,
    ).toBe(false);
  });

  it("пометка перед номером и законная пометка после номера на одной строке: объявление засчитывается, неуместная пометка остаётся в тексте", () => {
    const tasks = parseTaskList("- [ ] (move) 1.1 (move) Перенести проверку в `src/x.ts`\n");

    expect(tasks[0]!.declaresMove).toBe(true);
    expect(tasks[0]!.number).toBe("1.1");
    expect(tasks[0]!.text).toContain("(move)");
    expect(tasks[0]!.cleanText).toContain("(move)");
    expect(tasks[0]!.firstLine).toContain("(move)");
    expect(tasks[0]!.text.match(/\(move\)/g)).toHaveLength(1);
  });
});
