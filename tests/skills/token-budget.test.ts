import { describe, expect, it } from "vitest";

import { pxSection } from "./helpers.js";

describe("A dispatched agent's token budget is held by reading discipline", () => {
  it("the brief carries line numbers found once by the session, so the agent does not spend its own budget finding them again", () => {
    const section = pxSection("What a dispatched agent is handed");

    expect(section).toMatch(
      /found once by the session before the agent starts, so the agent does not spend its own budget finding them again\./,
    );
  });

  it("a dispatched agent does not read a large file whole: it finds its place with a line-numbered search and reads the range around it", () => {
    const section = pxSection("What a dispatched agent is handed");

    expect(section).toMatch(
      /does not read a large file whole: it finds its place with a line-numbered search and reads the range around it instead\./,
    );
  });

  it("while a cycle is being fixed, a run names the single test being fixed, and the whole file runs once, at the end of the cycle", () => {
    const section = pxSection("What a dispatched agent is handed");

    expect(section).toMatch(
      /while a cycle is being fixed, a run names the single test being fixed rather than the whole file, and the whole file runs once, at the end of the cycle\./,
    );
  });

  it("it runs only the checks its own tasks name, never the whole suite - a neighbour's half-finished edit, the budget its own output would cost, and the wave-boundary run that counts", () => {
    const section = pxSection("What a dispatched agent is handed");

    expect(section).toMatch(
      /never the whole suite: a neighbour's half-finished edit would make a wider run mean nothing either way, its own output would cost the budget too, and the wave-boundary `lexforge evidence record` is the one full run that counts\./,
    );
  });

  it("the size of a dispatched part is judged by the reading its tasks demand, not by the number of tasks it holds", () => {
    const section = pxSection("What a dispatched agent is handed");

    expect(section).toMatch(
      /the size of a dispatched part is judged by the reading its tasks demand, not by the number of tasks it holds\./,
    );
  });
});

describe("раздел 16: бюджет в 300 000 токенов на диспетчируемого агента", () => {
  it("называет бюджет ровно в 300 000 токенов, не приблизительно", () => {
    const section = pxSection("The token budget");

    expect(section).toMatch(/token budget of 300,000/);

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

  it("секцию, которая не влезает, дробит на части, вплоть до одного агента на задачу", () => {
    const section = pxSection("The token budget");

    expect(section).toMatch(/dispatched in parts, each part small enough to fit/);
    expect(section).toMatch(/down to one agent per task where nothing larger fits/);

    for (const phrase of [
      "where no part fits, a second agent may finish",
      "a second agent may finish what the first could not",
      "unless nothing smaller works, in which case a helper agent finishes it",
    ]) {
      expect(section, `«${phrase}» открывает второго агента на ту же секцию`).not.toContain(phrase);
    }
  });

  it("агент у предела бюджета останавливается, возвращает зелёные задачи и называет недостигнутые", () => {
    const section = pxSection("The token budget");

    expect(section).toMatch(/stops, returns the tasks that are green and reviewed/);
    expect(section).toMatch(/names the tasks it did not reach/);
    expect(section).toMatch(/stay unticked/);

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
    const section = pxSection("The token budget");

    expect(section).toMatch(/starts no agent to carry on its own work/);
    expect(section).toMatch(/reaching the budget is not a reason to/);

    for (const phrase of [
      "unless the budget runs out",
      "except when the budget is reached",
      "the budget running out is reason enough to",
    ]) {
      expect(section, `«${phrase}» открывает исключение по бюджету`).not.toContain(phrase);
    }
  });
});

