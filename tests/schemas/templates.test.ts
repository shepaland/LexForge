import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseTaskList } from "../../src/core/gates/task-list.js";
import { builtinSchemasDir, loadSchema } from "../../src/core/schemas/load-schema.js";

/**
 * Splits a task template into its `## N. Title` sections, each paired with
 * the raw lines standing between its heading and the next one (or the end
 * of the file). Used to check that a section body under a heading holds
 * nothing but the lone link of an index entry.
 */
function sectionBodies(text: string): Array<{ heading: string; body: string[] }> {
  const lines = text.split("\n");
  const headingIndexes: number[] = [];
  lines.forEach((line, index) => {
    if (/^##\s+\d+\./.test(line)) {
      headingIndexes.push(index);
    }
  });

  return headingIndexes.map((start, index) => {
    const end = headingIndexes[index + 1] ?? lines.length;
    return { heading: lines[start]!.trim(), body: lines.slice(start + 1, end) };
  });
}

/** Every HTML comment body found in the text, tags stripped. */
function htmlComments(text: string): string[] {
  return [...text.matchAll(/<!--([\s\S]*?)-->/g)].map((match) => match[1]!);
}

describe("шаблоны встроенных схем", () => {
  it("путь к схемам не зависит от рабочего каталога", () => {
    const previous = process.cwd();
    process.chdir(os.tmpdir());
    try {
      expect(loadSchema("spec-driven").artifacts).toHaveLength(4);
    } finally {
      process.chdir(previous);
    }
  });

  it.each(["spec-driven", "bounded"])("у схемы %s каждый шаблон лежит на диске и непуст", (name) => {
    const schema = loadSchema(name);

    for (const artifact of schema.artifacts) {
      const file = path.join(builtinSchemasDir(), name, artifact.template);

      expect(existsSync(file), file).toBe(true);
      expect(readFileSync(file, "utf8").trim().length, file).toBeGreaterThan(0);
    }
  });

  it.each(["spec-driven", "bounded"])(
    "у схемы %s шаблон tasks.md несёт строку «Depends on:»",
    (name) => {
      const file = path.join(builtinSchemasDir(), name, "templates", "tasks.md");

      expect(readFileSync(file, "utf8")).toContain("Depends on:");
    },
  );

  it("the spec-driven tasks.md template's comment example shows one well-formed label per task, shared across the one section it shows", () => {
    const file = path.join(builtinSchemasDir(), "spec-driven", "templates", "tasks.md");
    const text = readFileSync(file, "utf8");
    const tasks = parseTaskList(text);

    // Литерал держится рядом с проверками через парсер: он один закрепляет
    // конкретную форму "число, затем метка", которую проверки ниже не видят —
    // им всё равно, в каком порядке номер и метка стоят на строке, лишь бы
    // распарсенная задача несла ровно одну корректную метку.
    expect(text).toMatch(/-\s*\[ \]\s*1\.1\s*\[A\]/);

    expect(tasks.length).toBeGreaterThan(0);

    // The comment example is the only text left in this template that the
    // parser reads as tasks, and it is a single section (all `1.x`). It can
    // honestly demonstrate a label's form and that one section's tasks share
    // a label; it cannot demonstrate two sections differing, because it
    // shows only one. That claim lives on the fixture below instead.
    const labelBySection = new Map<string, string>();
    for (const task of tasks) {
      expect(task.groups, task.firstLine).toHaveLength(1);

      const [label] = task.groups;
      expect(label, task.firstLine).toMatch(/^[A-Za-z0-9-]{1,8}$/);

      const section = task.number.split(".")[0]!;
      const labelOfSection = labelBySection.get(section);
      if (labelOfSection === undefined) {
        labelBySection.set(section, label!);
      } else {
        expect(label, task.firstLine).toBe(labelOfSection);
      }
    }

    expect(text).toContain("Tasks sharing a label may run in one agent");
  });

  it("the bounded tasks.md template's comment example shows one well-formed label per task, shared across the one section it shows", () => {
    const file = path.join(builtinSchemasDir(), "bounded", "templates", "tasks.md");
    const text = readFileSync(file, "utf8");
    const tasks = parseTaskList(text);

    // Тот же приём, что и у spec-driven: литерал фиксирует форму "число,
    // затем метка" рядом с проверками через парсер, которым порядок номера
    // и метки на строке не важен.
    expect(text).toMatch(/-\s*\[ \]\s*1\.1\s*\[A\]/);

    expect(tasks.length).toBeGreaterThan(0);

    // Same reasoning as spec-driven above: the comment example is one
    // section, so it can only show a label's form and that a section's
    // tasks share it, not that two sections differ.
    const labelBySection = new Map<string, string>();
    for (const task of tasks) {
      expect(task.groups, task.firstLine).toHaveLength(1);

      const [label] = task.groups;
      expect(label, task.firstLine).toMatch(/^[A-Za-z0-9-]{1,8}$/);

      const section = task.number.split(".")[0]!;
      const labelOfSection = labelBySection.get(section);
      if (labelOfSection === undefined) {
        labelBySection.set(section, label!);
      } else {
        expect(label, task.firstLine).toBe(labelOfSection);
      }
    }

    expect(text).toContain("Tasks sharing a label may run in one agent");
  });

  // Two sections, two tasks apiece: what neither template's comment example
  // can show any more (it is one section), a fixture can. Parsed directly
  // with parseTaskList and asserted on, this is what a plan actually has to
  // satisfy - a section's tasks share a label, and two sections never reuse
  // one.
  const LABELLED_PLAN_FIXTURE = `
- [ ] 1.1 [A] do the first thing
- [ ] 1.2 [A] do the second thing
- [ ] 2.1 [B] do a third thing
- [ ] 2.2 [B] do a fourth thing
`;

  it("a plan's tasks carry one well-formed label each, shared within a section and distinct across sections", () => {
    const tasks = parseTaskList(LABELLED_PLAN_FIXTURE);
    expect(tasks.length).toBeGreaterThan(0);

    const labelBySection = new Map<string, string>();
    for (const task of tasks) {
      expect(task.groups, task.firstLine).toHaveLength(1);

      const [label] = task.groups;
      expect(label, task.firstLine).toMatch(/^[A-Za-z0-9-]{1,8}$/);

      const section = task.number.split(".")[0]!;
      const labelOfSection = labelBySection.get(section);
      if (labelOfSection === undefined) {
        labelBySection.set(section, label!);
      } else {
        expect(label, task.firstLine).toBe(labelOfSection);
      }
    }

    const sectionLabels = [...labelBySection.values()];
    expect(new Set(sectionLabels).size, sectionLabels.join(",")).toBe(sectionLabels.length);
  });

  it.each(["spec-driven", "bounded"])(
    "the %s tasks.md template writes the plan as an index: a lone link under every heading, no task and no Depends on: line",
    (name) => {
      const file = path.join(builtinSchemasDir(), name, "templates", "tasks.md");
      const text = readFileSync(file, "utf8");
      const sections = sectionBodies(text);

      expect(sections.length, text).toBeGreaterThanOrEqual(2);

      for (const { heading, body } of sections) {
        const nonBlank = body.map((line) => line.trim()).filter((line) => line.length > 0);

        expect(nonBlank, heading).toHaveLength(1);
        expect(nonBlank[0], heading).toMatch(/^`tasks\/[^`]+`$/);
      }

      const wholeBody = sections.flatMap((section) => section.body).join("\n");
      expect(wholeBody).not.toContain("Depends on:");
      expect(wholeBody).not.toMatch(/^\s*-\s*\[[ xX]\]/m);
    },
  );

  it.each(["spec-driven", "bounded"])(
    "the %s tasks.md template carries a comment showing the shape of a linked section file",
    (name) => {
      const file = path.join(builtinSchemasDir(), name, "templates", "tasks.md");
      const text = readFileSync(file, "utf8");
      const comments = htmlComments(text);

      const shapeComment = comments.find(
        (comment) => comment.includes("Depends on:") && /1\.1\s*\[A\]/.test(comment),
      );
      expect(shapeComment, text).toBeDefined();
      expect(shapeComment, text).toMatch(/1\.2\s*\[A\]/);
    },
  );
});
