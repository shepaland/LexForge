import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { planSection } from "./helpers.js";

function taskSizingText(): string {
  const path = fileURLToPath(new URL("../../skills/lexforge-plan/task-sizing.md", import.meta.url));
  return readFileSync(path, "utf8").replace(/\s+/g, " ");
}

describe("6.0.0: групповая метка задачи ушла из плана", () => {
  it("«The shape of the plan» не требует метки в квадратных скобках и не группирует задачи в агента", () => {
    const section = planSection("The shape of the plan");

    for (const phrase of [
      "group label",
      "[A]",
      "Tasks sharing a label",
      "TDD triple",
      "three tasks",
    ]) {
      expect(section, `«${phrase}» — метка или триада 5.x ещё в форме плана`).not.toContain(phrase);
    }
  });

  it("task-sizing.md ставит (move) сразу за номером задачи, без метки", () => {
    const text = taskSizingText();

    expect(text).toMatch(/carries `\(move\)` right after its number: `- \[ \] 3\.2 \(move\) \.\.\.`/);
    expect(text).not.toMatch(/group label|\[B\]|triple/);
  });
});
