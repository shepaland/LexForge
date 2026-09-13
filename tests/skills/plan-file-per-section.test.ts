import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { planSection } from "./helpers.js";

function planFilePerSectionText(): string {
  const path = fileURLToPath(
    new URL("../../skills/lexforge-plan/plan-file-per-section.md", import.meta.url),
  );
  return readFileSync(path, "utf8").replace(/\s+/g, " ");
}

describe("раздел 9: указатель на plan-file-per-section.md в форме плана", () => {
  it("«The shape of the plan» несёт указатель на plan-file-per-section.md", () => {
    const section = planSection("The shape of the plan");

    expect(section).toMatch(
      /see \[plan-file-per-section\.md\]\(plan-file-per-section\.md\)\./,
    );
  });
});

describe("tasks.md как индекс, файл на секцию", () => {
  it("tasks.md не несёт ни задачи, ни строки Depends on, и план из одной секции не освобождён от этого", () => {
    const text = planFilePerSectionText();

    expect(text).toMatch(
      /It holds no task and no `Depends on:` line of its own, no matter how many sections the plan carries - not even a plan of one section is exempt\./,
    );

    for (const phrase of ["a plan of one section may keep its tasks in the index"]) {
      expect(text, `«${phrase}» освобождает план из одной секции от правила`).not.toContain(
        phrase,
      );
    }
  });

  it("Depends on секции и её задачи живут в файле на один сегмент пути ниже tasks.md", () => {
    const text = planFilePerSectionText();

    expect(text).toMatch(
      /Each section's `Depends on:` line and its tasks live in a file of their own, one path segment below `tasks\.md`, linked from the section's entry in the index\./,
    );

    for (const phrase of ["each section usually lives in a file of its own"]) {
      expect(text, `«${phrase}» смягчает правило до обычной практики`).not.toContain(phrase);
    }
  });

  it("разбиение не меняет id задачи, и red-runs.json читает тот же ключ", () => {
    const text = planFilePerSectionText();

    expect(text).toMatch(
      /The split changes no task's id\. `red-runs\.json` reads a task by its id alone, never by file or line, so a record written before the split still answers for the same task after it\./,
    );

    for (const phrase of ["red-runs.json usually reads the same key after the split"]) {
      expect(text, `«${phrase}» допускает смену ключа red-runs.json`).not.toContain(phrase);
    }
  });
});
