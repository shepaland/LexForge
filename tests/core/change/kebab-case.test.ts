import { describe, expect, it } from "vitest";

import { isKebabCase, toKebabCase } from "../../../src/core/change/kebab-case.js";

describe("isKebabCase", () => {
  it("принимает имя из строчных букв, цифр и одиночных дефисов", () => {
    expect(isKebabCase("lexforge-cli-core")).toBe(true);
    expect(isKebabCase("a1")).toBe(true);
  });

  it("отвергает пробелы, подчёркивания, заглавные буквы и дефис по краям", () => {
    for (const name of ["Add Auth", "add_auth", "-auth", "auth-", "Auth"]) {
      expect(isKebabCase(name)).toBe(false);
    }
  });
});

describe("toKebabCase", () => {
  it("приводит имя с пробелами и заглавными буквами", () => {
    expect(toKebabCase("Add Auth Flow")).toBe("add-auth-flow");
  });
});
