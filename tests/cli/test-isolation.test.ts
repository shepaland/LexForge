import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import { describe, expect, it } from "vitest";

const EXPECTED = "\n`os.homedir()` returns the real home directory\n";

describe("изоляция модульных тестов", () => {
  it("os.homedir() отдаёт существующий пустой каталог, не равный HOME", () => {
    const home = os.homedir();

    expect(home, EXPECTED).not.toBe(process.env.HOME);
    expect(existsSync(home)).toBe(true);
    expect(readdirSync(home)).toEqual([]);
  });

  it("запрос к реестру npm отклоняется с указанием на setup-unit.ts", async () => {
    await expect(fetch("https://registry.npmjs.org/lexforge/latest")).rejects.toThrow(
      "tests/helpers/setup-unit.ts",
    );
  });
});
