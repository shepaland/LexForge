import { describe, expect, it } from "vitest";

import { DEFAULT_FILE_LIMIT_INCLUDE } from "../../../src/core/workspace/project-config.js";
import { countLines, isCovered } from "../../../src/core/gates/line-limit.js";

describe("countLines", () => {
  it("строка без переносов даёт 0", () => {
    expect(countLines("")).toBe(0);
    expect(countLines("a")).toBe(0);
  });

  it("считает количество символов новой строки", () => {
    expect(countLines("a\nb")).toBe(1);
    expect(countLines("a\nb\n")).toBe(2);
  });

  it("CRLF считается так же, как LF", () => {
    expect(countLines("a\r\nb\r\n")).toBe(2);
  });

  it("400 строк вида x\\n дают 400", () => {
    expect(countLines("x\n".repeat(400))).toBe(400);
  });
});

describe("isCovered", () => {
  it("список по умолчанию покрывает тесты и исходники", () => {
    expect(isCovered("tests/login.test.ts", DEFAULT_FILE_LIMIT_INCLUDE)).toBe(true);
    expect(isCovered("src/a.py", DEFAULT_FILE_LIMIT_INCLUDE)).toBe(true);
    expect(isCovered("web/App.vue", DEFAULT_FILE_LIMIT_INCLUDE)).toBe(true);
  });

  it("список по умолчанию не покрывает документацию и локи", () => {
    expect(isCovered("README.md", DEFAULT_FILE_LIMIT_INCLUDE)).toBe(false);
    expect(isCovered("package-lock.json", DEFAULT_FILE_LIMIT_INCLUDE)).toBe(false);
    expect(isCovered("lexforge/config.yaml", DEFAULT_FILE_LIMIT_INCLUDE)).toBe(false);
    expect(isCovered("data/fixture.json", DEFAULT_FILE_LIMIT_INCLUDE)).toBe(false);
  });

  it("отрицающий паттерн исключает поддерево из совпавшего include", () => {
    const include = ["src/**/*.ts", "!src/generated/**"];
    expect(isCovered("src/cart.ts", include)).toBe(true);
    expect(isCovered("src/generated/client.ts", include)).toBe(false);
    expect(isCovered("lib/cart.ts", include)).toBe(false);
  });

  it("список из одних отрицаний не покрывает ничего", () => {
    const include = ["!src/generated/**"];
    expect(isCovered("src/generated/client.ts", include)).toBe(false);
    expect(isCovered("src/cart.ts", include)).toBe(false);
  });
});
