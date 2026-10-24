import { describe, expect, it } from "vitest";

import { epSection } from "./helpers.js";

describe("раздел 16: бюджет в 300 000 токенов на исполнителя одной задачи", () => {
  it("называет бюджет ровно в 300 000 токенов, не приблизительно", () => {
    const section = epSection("How you work");

    expect(section).toMatch(/300,000 tokens/);

    for (const phrase of [
      "about 300,000",
      "roughly 300,000",
      "around 300,000",
      "approximately 300,000",
      "up to 300,000",
      "nearly 300,000",
      "at least 300,000",
      "over 300,000",
    ]) {
      expect(section, `«${phrase}» смягчает точное число`).not.toContain(phrase);
    }
  });

  it("у предела бюджета останавливается, возвращает закоммиченное и называет недостигнутое", () => {
    const section = epSection("How you work");

    expect(section).toMatch(/stop, return what you committed/);
    expect(section).toMatch(/name under questions what you did not reach/);

    for (const phrase of [
      "unless the remaining work is small enough to finish",
      "unless the work left is nearly done",
      "it may carry on with what is left",
    ]) {
      expect(section, `«${phrase}» открывает исключение из остановки на бюджете`).not.toContain(
        phrase,
      );
    }
  });

  it("запрещает запускать агента, чтобы продолжить свою же работу, без исключения по бюджету", () => {
    const section = epSection("How you work");

    expect(section).toMatch(/not a reason to start an agent to carry the work on/);

    for (const phrase of [
      "unless the budget runs out",
      "except when the budget is reached",
      "the budget running out is reason enough to",
    ]) {
      expect(section, `«${phrase}» открывает исключение по бюджету`).not.toContain(phrase);
    }
  });
});

describe("дисциплина чтения держит бюджет исполнителя одной задачи", () => {
  it("номера строк приходят вместе с брифом, найденные сессией заранее", () => {
    const section = epSection("How you work");

    expect(section).toMatch(
      /the brief carries the line numbers of what you have to work on, found once by the session before you started/,
    );
    expect(section).toMatch(/do not search for them again/);
  });

  it("большой файл находится построчным поиском вместо чтения целиком", () => {
    const section = epSection("How you work");

    expect(section).toMatch(
      /find your place with a line-numbered search and read the range around it, never the whole file/,
    );
  });

  it("правка называет единственный тест до зелёного; команда задачи целиком — только на red и green", () => {
    const section = epSection("How you work");

    expect(section).toMatch(/name the single test you are fixing in every run/);
    expect(section).toMatch(/`command:` runs in full only at `task red` and `task green`/);
  });
});
