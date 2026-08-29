import { describe, expect, it } from "vitest";

import { loadSchema } from "../../src/core/schemas/load-schema.js";

const SCHEMAS = ["spec-driven", "bounded"];
const MAX_WORDS = 35;

function lastNonEmptyLine(text: string): string {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  return lines[lines.length - 1]!.trim();
}

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

describe.each(SCHEMAS)("инструкции схемы %s", (name) => {
  const schema = loadSchema(name);

  it("каждая инструкция заканчивается строкой со следующим шагом", () => {
    for (const artifact of schema.artifacts) {
      expect(lastNonEmptyLine(artifact.instruction).startsWith("Next step:")).toBe(true);
    }
  });

  it("инструкция не последнего артефакта зовёт инструкции следующего", () => {
    schema.artifacts.slice(0, -1).forEach((artifact, index) => {
      const next = schema.artifacts[index + 1]!;
      expect(artifact.instruction).toContain(`lexforge instructions ${next.id} --change`);
    });
  });

  it("инструкция последнего артефакта называет переход к реализации", () => {
    const last = schema.artifacts[schema.artifacts.length - 1]!;

    expect(last.instruction).toContain("implement");
  });

  it(`ни одно предложение инструкции не длиннее ${MAX_WORDS} слов`, () => {
    for (const artifact of schema.artifacts) {
      for (const sentence of sentences(artifact.instruction)) {
        const words = sentence.split(" ").filter((word) => word.length > 0);
        expect(
          words.length,
          `${name}/${artifact.id}: "${sentence}"`,
        ).toBeLessThanOrEqual(MAX_WORDS);
      }
    }
  });
});
