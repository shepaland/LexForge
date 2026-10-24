import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const FILES = [
  "skills/lexforge-plan/plan-file-per-section.md",
  "skills/lexforge-apply/parallel.md",
  "skills/lexforge-apply/executor-prompt.md",
  "skills/lexforge-verify/SKILL.md",
  "README.md",
  "README.ru.md",
];

describe("the product states no line limit", () => {
  for (const file of FILES) {
    it(`${file} names no file_limit and no long_files`, () => {
      const text = readFileSync(path.join(REPO_ROOT, file), "utf8");

      expect(text).not.toMatch(/file_limit|long_files|## Line limit|## Предел длины файла|filesOverLimit/);
    });
  }

  it("the executor's brief no longer hands over a line limit", () => {
    const text = readFileSync(
      path.join(REPO_ROOT, "skills/lexforge-apply/executor-prompt.md"),
      "utf8",
    );

    expect(text).not.toMatch(/## The line limit/);
    expect(text).not.toMatch(/\bline limit\b/i);
  });
});
