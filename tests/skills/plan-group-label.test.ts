import { describe, expect, it } from "vitest";

import { planSection } from "./helpers.js";

describe("раздел 17: групповая метка задачи в плане", () => {
  it("метка задачи стоит в квадратных скобках сразу после её номера", () => {
    const section = planSection("The shape of the plan");

    expect(section).toMatch(/\[ \] 3\.1 \[A\] \.\.\.`/);
    expect(section).toMatch(/group label in square brackets right after its id/);

    for (const phrase of ["a label may be left out where the section runs alone"]) {
      expect(section, `«${phrase}» смягчает обязательность метки`).not.toContain(phrase);
    }
  });

  it("задачи с общей меткой может выполнить один агент", () => {
    const section = planSection("The shape of the plan");

    expect(section).toMatch(/Tasks sharing a label may run in one agent/);

    for (const phrase of ["tasks sharing a label usually run in one agent"]) {
      expect(section, `«${phrase}» смягчает правило до обычной практики`).not.toContain(phrase);
    }
  });

  it("секция, которую берёт один агент целиком, несёт одну метку на все задачи", () => {
    const section = planSection("The shape of the plan");

    expect(section).toMatch(
      /a section one agent takes whole carries one label across every task in it/,
    );

    for (const phrase of [
      "a section one agent takes whole may carry one label across most of its tasks",
    ]) {
      expect(section, `«${phrase}» допускает исключения внутри секции`).not.toContain(phrase);
    }
  });

  it("два, чьи задачи называют один файл, не расходятся по разным меткам", () => {
    const section = planSection("The shape of the plan");

    expect(section).toMatch(/two groups of a section never name the same file/);
    expect(section).toMatch(/a TDD triple keeps one label across all three tasks/);

    for (const phrase of ["two groups of a section usually avoid naming the same file"]) {
      expect(section, `«${phrase}» смягчает запрет до обычной практики`).not.toContain(phrase);
    }

    for (const phrase of ["a triple may be split when the files differ"]) {
      expect(section, `«${phrase}» допускает разные метки внутри одной триады`).not.toContain(
        phrase,
      );
    }
  });
});
