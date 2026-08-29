import { describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import { parseOutputTarget } from "../../../src/core/schemas/output-target.js";

describe("parseOutputTarget", () => {
  it("разбирает имя файла", () => {
    expect(parseOutputTarget("proposal.md")).toEqual({ kind: "file", path: "proposal.md" });
  });

  it("разбирает глоб набора файлов", () => {
    expect(parseOutputTarget("specs/**/*.md")).toEqual({
      kind: "glob",
      dir: "specs",
      extension: "md",
    });
  });

  it.each(["specs/*.md", "**/*"])("отвергает форму %s", (generates) => {
    expect(() => parseOutputTarget(generates)).toThrow(UsageError);
    try {
      parseOutputTarget(generates);
      expect.unreachable("ожидалось исключение");
    } catch (error) {
      expect((error as UsageError).code).toBe("schema-invalid");
    }
  });
});
