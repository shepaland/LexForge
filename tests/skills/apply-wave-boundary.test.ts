import { describe, expect, it } from "vitest";

import { readSkills } from "../helpers/read-skills.js";
import { SKILLS, pxSection } from "./helpers.js";

describe("раздел 10: параллельные секции в lexforge-apply — волна и штамп", () => {
  function applyBody(): string {
    return readSkills(SKILLS).find((entry) => entry.dir === "lexforge-apply")!.body;
  }

  it("IMPORTANT 2 (раунд 4): SKILL.md сам несёт «whether or not the change is already under way», не только сосед", () => {
    const lower = applyBody().toLowerCase().replace(/\s+/g, " ");
    const linkIndex = lower.indexOf("[parallel-execution.md](parallel-execution.md)");

    expect(linkIndex, "ссылка на parallel-execution.md не найдена в теле").toBeGreaterThan(-1);

    const sentence = lower.slice(linkIndex, linkIndex + 150);

    expect(sentence).toMatch(/before your first task/);
    expect(sentence).toMatch(/whether or not the change is already under way/);
  });

  it("МИНОР: «closed» определено там, где впервые используется, и это же слово применяется к зависимости", () => {
    const section = pxSection("A wave is every section ready at once");

    expect(section).toMatch(/a section is closed when every one of its checkboxes is marked/);

    // The dependency check uses the defined term, not an undefined synonym.
    const dependsIndex = section.indexOf("`depends on:` line names is");
    expect(dependsIndex, "предложение о зависимости не найдено").toBeGreaterThan(-1);
    expect(section.slice(dependsIndex, dependsIndex + 60)).toMatch(/is closed\b/);
  });

  it("раздел «A wave is every section ready at once» называет юнитом раздел словом и запрещает слияние", () => {
    const section = pxSection("A wave is every section ready at once");

    // MINOR 14: the unit is named, not just implied by the heading.
    expect(section).toMatch(/\bsection\b/);
    expect(section).toMatch(/their own executor agent|its own executor agent/);
    expect(section).toMatch(/never merged into one pass|not merged into one pass/);
    // The loop is enumerated, not just referenced by name.
    expect(section).toMatch(/test, red, implementation, green, review, checkbox/);

    for (const phrase of [
      "may be merged",
      "can be merged",
      "merged when",
      "one pass for",
      "merge them",
      "folded into a neighbour",
      "folded into one",
      "run as a pair",
      "may be folded",
      "may compress",
      "compress where",
    ]) {
      // Every banned phrase except the two the file itself uses to state the ban
      // ("folded into one", "run as a pair" appear right after "never merged" -
      // check them only outside that clause).
      if (phrase === "folded into one" || phrase === "run as a pair") {
        continue;
      }
      expect(section, `«${phrase}» разрешает слияние секций`).not.toContain(phrase);
    }
  });

  it("волна из одной секции без соседей выполняется сессией, без исполнителя, и это согласовано в двух местах", () => {
    const waveSection = pxSection("A wave is every section ready at once");
    const stampSection = pxSection("The checkbox and the stamp");

    // IMPORTANT 6 / CRITICAL 3: both places that talk about a lone section agree.
    expect(waveSection).toMatch(/no concurrent neighbour/);
    expect(waveSection).toMatch(/no executor agent is dispatched/);

    // MINOR: the stamp section's degenerate-wave wording covers "no parallel
    // neighbour" broadly - the same condition the wave section names.
    expect(stampSection).toMatch(/no section runs in parallel with another/);
  });

  it("IMPORTANT 10: ни одна секция не диспетчеризуется, пока текущая волна не закрылась штампом", () => {
    const waveSection = pxSection("A wave is every section ready at once");

    expect(waveSection).toMatch(/no section is dispatched until its own wave closes/);

    for (const phrase of ["joins the running wave", "dispatched immediately", "added to the wave"]) {
      expect(waveSection, `«${phrase}» досрочно диспетчеризует секцию`).not.toContain(phrase);
    }
  });

  it("CRITICAL 1 / IMPORTANT 8: красная секция читается сразу, тикаются все её зелёные задачи, не только целиком чистая секция", () => {
    const section = pxSection("One executor comes back red while others are still running");

    // Positive framing, not "hold everything until told otherwise".
    expect(section).toMatch(/its report is still read right away, the same as any other/);
    expect(section).toMatch(/each task in it whose own entry shows a green run/);
    expect(section).toMatch(/whichever section it came from/);
    expect(section).toMatch(/dispatch no further section/);
    expect(section).toMatch(/let the executors still running finish/);

    for (const phrase of [
      "close nothing yet",
      "hold the ticks",
      "wait to tick",
      "dispatch the remaining",
      "already came back clean",
    ]) {
      expect(section, `«${phrase}» откладывает то, что уже должно случиться`).not.toContain(phrase);
    }
  });

  it("IMPORTANT 9: код возврата `1` назван по команде — lexforge evidence record, а не безымянный красный запуск", () => {
    const section = pxSection("A red stamp");

    expect(section).toMatch(/exit code of `1` from `lexforge evidence record`/);
    expect(section).toMatch(/dispatch no further section/);
    expect(section).toMatch(/checkboxes already marked.*stay marked/);
  });

  it("МИНОР 13: волна не останавливается «anyway» — положительное утверждение плюс узкий запрет", () => {
    const stampSection = pxSection("The checkbox and the stamp");
    const failSection = pxSection("One executor comes back red while others are still running");

    // Positive: the stamp command follows sections coming back, never being dispatched.
    expect(stampSection).toMatch(/has come back/);
    expect(stampSection).not.toMatch(/once the wave is dispatched/);

    // Narrow ban: the specific inversion the reviewer used, not the whole word.
    expect(failSection + stampSection).not.toMatch(/sections? anyway/);

    for (const phrase of [
      "may run `lexforge evidence record`",
      "can run `lexforge evidence record`",
    ]) {
      expect(stampSection, `«${phrase}» разрешает то, что раздел запрещает`).not.toContain(phrase);
    }

    expect(stampSection).toMatch(/executor agent does not run `lexforge evidence record`/);
  });

  it("тело lexforge-apply держит штамп на волновой границе — не на границе задачи, и не откатывается к пустой клетке", () => {
    // A source line wrap must not break a phrase match.
    const body = applyBody().toLowerCase().replace(/\s+/g, " ");
    const runIndex = body.indexOf("lexforge evidence record --change <name> --label tests");

    expect(runIndex, "команда штампа не найдена в теле").toBeGreaterThan(-1);

    const after = body.slice(runIndex, runIndex + 90);

    // CRITICAL 2: "wave boundary", not "task boundary".
    expect(after).toMatch(/wave boundary/);
    expect(after).not.toMatch(/task boundary/);

    const exitIndex = body.indexOf("exit `1`");
    expect(exitIndex).toBeGreaterThan(-1);

    const exitSentence = body.slice(exitIndex, exitIndex + 120);

    // Old-round C2: reverting to "the box stays empty" must fail.
    expect(exitSentence).toMatch(/ticked boxes stay ticked/);
    expect(exitSentence).not.toMatch(/box stays empty/);
  });

});
