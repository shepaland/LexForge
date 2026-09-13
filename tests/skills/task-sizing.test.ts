import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { planSection } from "./helpers.js";

function taskSizingText(): string {
  const path = fileURLToPath(new URL("../../skills/lexforge-plan/task-sizing.md", import.meta.url));
  return readFileSync(path, "utf8").replace(/\s+/g, " ");
}

describe("раздел 18: указатель на task-sizing.md в форме плана", () => {
  it("«The shape of the plan» несёт указатель на task-sizing.md", () => {
    const section = planSection("The shape of the plan");

    expect(section).toMatch(
      /not given a bigger budget: see \[task-sizing\.md\]\(task-sizing\.md\)\./,
    );
  });
});

describe("правило разбивки задачи без зелёной середины", () => {
  it("задача рассчитана на один цикл с зелёным набором в конце", () => {
    const text = taskSizingText();

    expect(text).toMatch(
      /A task is sized so that one cycle finishes it and the suite is green when the cycle ends\./,
    );
  });

  it("работа без промежуточной зелёной точки не пишется одной задачей - она разбивается на шаги", () => {
    const text = taskSizingText();

    expect(text).toMatch(
      /is not written as one task: it is cut into steps, each of which leaves the suite green when it ends\./,
    );
  });

  it("замена структуры держит старый и новый путь рядом до последнего шага", () => {
    const text = taskSizingText();

    expect(text).toMatch(
      /those steps keep the old structure and the new one side by side until the last step: the new path is added first, callers move to it one at a time in the steps that follow, and the old path is removed only in the final step\./,
    );
  });

  it("задачу, которую никто не может закончить, разбивают, а не дают ей больший бюджет", () => {
    const text = taskSizingText();

    expect(text).toMatch(
      /is a plan defect, not a task that needs a larger budget: it is cut into steps, and a bigger budget is not offered as the fix\./,
    );
  });
});
