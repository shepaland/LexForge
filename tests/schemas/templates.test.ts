import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { builtinSchemasDir, loadSchema } from "../../src/core/schemas/load-schema.js";

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
});
