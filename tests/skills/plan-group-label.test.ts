import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { planSection } from "./helpers.js";

function taskSizingText(): string {
  const path = fileURLToPath(new URL("../../skills/lexforge-plan/task-sizing.md", import.meta.url));
  return readFileSync(path, "utf8").replace(/\s+/g, " ");
}

describe("6.0.0: групповая метка задачи ушла из плана", () => {
  it("«The shape of the plan» описывает задачу через Files, Test и Command, без метки в квадратных скобках и без триады на три задачи", () => {
    const section = planSection("The shape of the plan").replace(/\s+/g, " ");

    expect(section).toMatch(
      /tasks `- \[ \] 1\.1`, each with `Files:`, `Test:` and `Command:`: the files it may write, the test that fails first, the command that runs it\./,
    );
    expect(section).toMatch(
      /A move carries `\(move\)` after its number and no `Test:`\./,
    );

    for (const phrase of [
      "group label",
      "[A]",
      "Tasks sharing a label",
      "TDD triple",
      "three tasks",
      "one action each",
    ]) {
      expect(section, `«${phrase}» — метка или триада 5.x ещё в форме плана`).not.toContain(phrase);
    }
  });

  it("задача, которую якобы может взять общий агент, не описана отдельно от остальных - делит их один и тот же executor", () => {
    const section = planSection("The shape of the plan").replace(/\s+/g, " ");

    for (const phrase of [
      "tasks sharing a label may run in one agent",
      "a section one agent takes whole carries one label",
    ]) {
      expect(section, `«${phrase}» возвращает группировку по метке`).not.toContain(phrase);
    }
  });

  it("task-sizing.md ставит (move) сразу за номером задачи, без метки", () => {
    const text = taskSizingText();

    expect(text).toMatch(/carries `\(move\)` right after its number: `- \[ \] 3\.2 \(move\) \.\.\.`\./);
    expect(text).not.toMatch(/group label|\[B\]|\btriple\b/);
  });
});
