import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { checkPlan } from "../../src/core/gates/plan-check.js";
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

  it.each(["spec-driven", "bounded"])(
    "the %s tasks.md template shows a task with its fields and no group label",
    (schema) => {
      const text = readFileSync(
        path.join(builtinSchemasDir(), schema, "templates", "tasks.md"),
        "utf8",
      );

      for (const field of ["Files:", "Test:", "Command:", "Depends on:"]) {
        expect(text).toContain(field);
      }
      expect(text).not.toMatch(/\[A\]|execution-plan\.json|group label/);
    },
  );

  it("the example plan passes check plan", () => {
    const exampleRoot = path.join(builtinSchemasDir(), "..", "examples", "notes");

    expect(checkPlan({ cwd: exampleRoot, change: "add-search" }).data.findings).toEqual([]);
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
        (comment) => comment.includes("Depends on:") && /1\.1\s+<what/.test(comment),
      );
      expect(shapeComment, text).toBeDefined();
      expect(shapeComment, text).toContain("Files:");
    },
  );
});
