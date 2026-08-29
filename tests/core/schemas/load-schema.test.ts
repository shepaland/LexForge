import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import { listSchemaNames, loadSchema } from "../../../src/core/schemas/load-schema.js";

const FIXTURES = fileURLToPath(new URL("../../fixtures/schemas", import.meta.url));

function loadError(name: string): UsageError {
  try {
    loadSchema(name, FIXTURES);
  } catch (error) {
    if (error instanceof UsageError) {
      return error;
    }
    throw error;
  }
  throw new Error(`ожидалось исключение для схемы ${name}`);
}

describe("loadSchema на валидном описании", () => {
  it("возвращает два артефакта в порядке из YAML", () => {
    const schema = loadSchema("minimal", FIXTURES);

    expect(schema.name).toBe("minimal");
    expect(schema.artifacts.map((artifact) => artifact.id)).toEqual(["first", "second"]);
  });

  it("читает requires и instruction", () => {
    const schema = loadSchema("minimal", FIXTURES);
    const [first, second] = schema.artifacts;

    expect(first!.requires).toEqual([]);
    expect(second!.requires).toEqual(["first"]);
    expect(first!.instruction).toContain("Write the first artifact.");
    expect(second!.instruction).toContain("Next step: implement the change.");
  });
});

const BROKEN = [
  "cycle",
  "missing-template",
  "unknown-requires",
  "duplicate-id",
  "empty-artifacts",
  "bad-generates",
];

describe("loadSchema на битом описании", () => {
  it.each(BROKEN)("описание %s даёт UsageError с кодом schema-invalid", (name) => {
    expect(loadError(name).code).toBe("schema-invalid");
  });

  it("текст цикла называет схему и оба артефакта цикла", () => {
    const message = loadError("cycle").message;

    expect(message).toContain("cycle");
    expect(message).toMatch(/\ba\b/);
    expect(message).toMatch(/\bb\b/);
  });

  it("текст отсутствующего шаблона печатает ожидаемый путь", () => {
    expect(loadError("missing-template").message).toContain("missing-template/templates/nosuch.md");
  });

  it("текст неизвестной зависимости называет идентификатор", () => {
    expect(loadError("unknown-requires").message).toContain("nosuch");
  });
});

describe("loadSchema на несуществующей схеме", () => {
  it("даёт schema-unknown со списком всех известных имён", () => {
    const error = loadError("nosuch");
    const names = listSchemaNames(FIXTURES);

    expect(error.code).toBe("schema-unknown");
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(error.message).toContain(name);
    }
  });

  it("отдаёт имена схем по алфавиту", () => {
    const names = listSchemaNames(FIXTURES);

    expect(names).toEqual([...names].sort());
  });
});
