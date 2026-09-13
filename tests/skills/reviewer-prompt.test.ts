import { describe, expect, it } from "vitest";

import { rpSection } from "./helpers.js";

describe("раздел 13: reviewer-prompt.md запрещает ревьюеру запускать проект", () => {
  it("«How you work» запрещает ревьюеру запускать тест, сборку или скрипт проекта", () => {
    const section = rpSection("How you work");

    expect(section).toMatch(/run no test, no build, no script of the change/);
    expect(section).toMatch(/the output of the run the executor already performed/);

    for (const phrase of [
      "run the test to confirm",
      "may run the test",
      "run the build to check",
      "you may run a scoped test",
    ]) {
      expect(section, `«${phrase}» разрешает ревьюеру запуск`).not.toContain(phrase);
    }
  });

  it("«Reading the answer» отправляет обратно вердикт, основанный на собственном прогоне ревьюера", () => {
    const section = rpSection("Reading the answer");

    expect(section).toMatch(/a verdict resting on the reviewer's own run is sent back/);

    for (const phrase of [
      "a verdict resting on the reviewer's own run is accepted",
      "a verdict resting on the reviewer's own run is fine",
    ]) {
      expect(section, `«${phrase}» принимает вердикт на собственном прогоне`).not.toContain(phrase);
    }
  });
});

