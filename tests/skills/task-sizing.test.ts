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

describe("правило разбивки задачи без зелёной середины, по мерке задачи-с-командами", () => {
  it("задача рассчитана на одного исполнителя: от красного прогона до зелёного, с зелёным набором при закрытии", () => {
    const text = taskSizingText();

    expect(text).toMatch(
      /A task is sized so that one executor finishes it, from the red run to the green run, and the suite is green when the task closes\./,
    );

    for (const phrase of [
      "one cycle finishes it and the suite is green when the cycle ends",
      "One cycle is one test, its red run, the implementation and the green run",
    ]) {
      expect(text, `«${phrase}» — словарь 5.x циклов ещё в разделе`).not.toContain(phrase);
    }
  });

  it("работа без промежуточной зелёной точки не пишется одной задачей - она разбивается на задачи", () => {
    const text = taskSizingText();

    expect(text).toMatch(
      /is not written as one task: it is cut into tasks, each of which leaves the suite green when it closes\./,
    );

    for (const phrase of [
      "it is cut into steps, each of which leaves the suite green when it ends",
    ]) {
      expect(text, `«${phrase}» — единица 5.x «шаг», не «задача»`).not.toContain(phrase);
    }
  });

  it("замена структуры держит старый и новый путь рядом до последней задачи", () => {
    const text = taskSizingText();

    expect(text).toMatch(
      /those tasks keep the old structure and the new one side by side until the last task: the new path is added first, callers move to it one at a time in the tasks that follow, and the old path is removed only in the final task\./,
    );

    for (const phrase of [
      "those steps keep the old structure and the new one side by side until the last step",
    ]) {
      expect(text, `«${phrase}» — единица 5.x «шаг», не «задача»`).not.toContain(phrase);
    }
  });

  it("задачу, которую никто не может закончить, режут на задачи через lexforge plan amend, а не дают ей больший бюджет", () => {
    const text = taskSizingText();

    expect(text).toMatch(
      /is a plan defect, not a task that needs a larger budget: during implementation it is cut into tasks through `lexforge plan amend`, and a bigger budget is not offered as the fix\./,
    );

    for (const phrase of ["a task that needs a larger budget: it is cut into steps, and a bigger budget"]) {
      expect(text, `«${phrase}» режет без называть \`lexforge plan amend\``).not.toContain(phrase);
    }
  });

  it("пример разбивки называет lexforge plan amend и отказ от большего бюджета, а не только приём «strangler»", () => {
    const text = taskSizingText();

    expect(text).toMatch(/`lexforge plan amend` cut it into four tasks/);
    expect(text).toMatch(/a bigger budget was never offered as the fix\./);
    expect(text, "пример больше не называет исполнителей «dispatched agents»").not.toContain(
      "Three dispatched agents in a row blew their budget",
    );
  });
});
