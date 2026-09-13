import { describe, expect, it } from "vitest";

import { readSkills } from "../helpers/read-skills.js";
import { SKILLS, pxSection } from "./helpers.js";

/**
 * `pxSection` already collapses whitespace runs to one space and lowercases
 * the result; this constant is written to match that shape exactly, so a
 * plain `.trim()` on the section is enough to compare with `toBe`.
 */
const EXPECTED_RATIONALIZATIONS_SECTION =
  "## rationalizations | excuse | reality | |---|---| " +
  '| "each task closed behind its own freshly dispatched `general-purpose` reviewer, the same as 1.1-1.5, never a further executor" ' +
  "| a reviewer is an agent. you started it; the rule ends there. | " +
  '| "this doesn\'t start a further executor, so it clears that specific bar" ' +
  "| the bar is any agent at all, not a further executor. | " +
  '| "i start no `fork` and no further executor of any kind for the *doing*" ' +
  '| "of any kind" carries no clause about the doing. the reviewer is the agent you just started. |';

describe("раздел 13: таблица оправданий из живых прогонов давления (change no-delegated-implementation)", () => {
  it("parallel-execution.md несёт раздел «Rationalizations» с таблицей «Excuse | Reality»", () => {
    const section = pxSection("Rationalizations");

    expect(section).toMatch(/\|\s*excuse\s*\|\s*reality\s*\|/);
  });

  it("раздел совпадает с ожидаемым дословно: ровно три строки таблицы, снятые с живых прогонов давления", () => {
    const section = pxSection("Rationalizations").trim();

    // A phrase-by-phrase match lets a fourth row slip in unnoticed as long
    // as it doesn't remove the first three; a whole-section equality does
    // not - any added, removed, or reworded row breaks it, so a fourth row
    // (legitimizing an excuse or not) fails this test until the author
    // updates it on purpose.
    expect(section).toBe(EXPECTED_RATIONALIZATIONS_SECTION);
  });

  it("не сужает «of any kind» обратно оговоркой, что запрет держит только *doing*", () => {
    const section = pxSection("Rationalizations");

    // Inverting run 4's own words at the same spot - "of any kind" followed
    // by a clause that excuses the reviewer dispatch - is exactly the cut
    // the row exists to name as unlawful, so the row's own text must not
    // read that way itself.
    for (const phrase of [
      "of any kind, except the doing",
      "of any kind except for the doing",
      "of any kind, so long as it is not the doing",
    ]) {
      expect(section, `«${phrase}» сужает запрет обратно до *doing*`).not.toContain(phrase);
    }
  });
});

describe("раздел 11: «What an executor may start» — запрет по типу агента, не только по роли", () => {
  it("раздел «What an executor may start» утверждает, что исполнитель не запускает ни одного агента, а сессия — каждого", () => {
    const section = pxSection("What an executor may start");

    // The old text let the executor start a reviewer as the one lawful
    // agent; this replaces that carve-out rather than widening it - the
    // executor starts no agent of any kind, and the session starts every
    // one, each executor and each reviewer alike. Anchored at the sentence's
    // own period so a qualifier slipped in before it ("...of any kind,
    // except a reviewer.") still fails the match.
    expect(section).toMatch(/an executor dispatched for a section starts no agent, of any kind\./);
    expect(section).toMatch(
      /the session that holds the plan starts every agent of the implementation stage - each executor and each reviewer - and no agent is started by anything else\./,
    );

    for (const phrase of [
      "starts reviewer agents and nothing else",
      "the one lawful agent is a reviewer",
      "except a reviewer",
      "other than a reviewer",
      "unless it is a reviewer",
    ]) {
      expect(section, `«${phrase}» оставляет ревьюера законным исключением`).not.toContain(phrase);
    }
  });

  it("раздел «What an executor may start» запрещает по типу: context-inheriting, brief-carrying, extra-hands, self-delegation", () => {
    const section = pxSection("What an executor may start");
    const unlawfulIndex = section.indexOf("unlawful by type");

    expect(unlawfulIndex, "«unlawful by type» не найдено").toBeGreaterThan(-1);

    const window = section.slice(unlawfulIndex, unlawfulIndex + 500);

    // Five types, named as examples of a type, not of a role - the reviewer
    // joins the list now that starting one is no longer the executor's one
    // lawful exception (spec scenario: "An executor starts its own reviewer").
    expect(window).toMatch(/inherits the calling session's context/);
    expect(window).toMatch(/handed the section brief or any part of it/);
    expect(window).toMatch(/started to ask for a second pair of hands;/);
    expect(window).toMatch(/a reviewer started by the executor instead of the session;/);
    expect(window).toMatch(/delegating to oneself/);

    // A name the runtime gives the type does not launder it, and neither does
    // a plan to review the result afterwards.
    expect(window).toMatch(/name the runtime gives the type does not make it lawful/);
    expect(window).toMatch(/an intent to review the result afterwards/);

    // Not a closed list: the enumeration is examples, so a fifth type a
    // runtime invents next month is still covered.
    expect(section).toMatch(/not a closed list/);

    for (const phrase of ["is lawful", "these are permitted", "may be started freely"]) {
      expect(window, `«${phrase}» относит запрещённый тип к законным`).not.toContain(phrase);
    }
  });

  it("раздел «What an executor may start» формулирует проверку по эффекту, не по названию типа", () => {
    const section = pxSection("What an executor may start");
    const effectIndex = section.indexOf("the test holds by effect");

    expect(effectIndex, "«the test holds by effect» не найдено").toBeGreaterThan(-1);

    const window = section.slice(effectIndex, effectIndex + 400);

    expect(window).toMatch(
      /an agent that continues the executor's own work instead of looking at it is the forbidden one/,
    );
    expect(window).toMatch(/whatever its type is called/);
    expect(window).toMatch(
      /a reviewer reads and judges; anything that writes, runs, or decides on the executor's behalf is an executor/,
    );

    for (const phrase of ["is the lawful one", "is allowed", "is permitted"]) {
      expect(window, `«${phrase}» переворачивает проверку по эффекту`).not.toContain(phrase);
    }
  });

  it("раздел «What an executor may start» не закрывает клетку за работой запрещённого агента", () => {
    const section = pxSection("What an executor may start");

    expect(section).toMatch(/reports the violation in the entry of every task it/);
    expect(section).toMatch(/marks no checkbox for those tasks/);
    expect(section).toMatch(/treats them as unclosed whatever code stands in the tree/);
    expect(section).toMatch(/watch it fail, and put it back inside the same task/);

    for (const phrase of ["closes the checkbox once reviewed", "counts toward the tick"]) {
      expect(section, `«${phrase}» закрывает клетку за незасвидетельствованной работой`).not.toContain(
        phrase,
      );
    }
  });
});

describe("раздел 12: unaccounted state stops the work", () => {
  function skillRedFlags(): string {
    const skill = readSkills(SKILLS).find((entry) => entry.dir === "lexforge-apply")!;
    const start = skill.body.toLowerCase().indexOf("## red flags");

    expect(start, "раздел «Red flags» не найден в SKILL.md").toBeGreaterThan(-1);

    return skill.body.slice(start).toLowerCase();
  }

  it("parallel-execution.md называет пути, коммит и ветку словом «unaccounted», а не как чужую работу", () => {
    const section = pxSection("Unaccounted state");

    expect(section).toMatch(/the paths, the commit, the branch - written out/);
    expect(section).toMatch(/call it unaccounted/);
    expect(section).toMatch(/state you cannot explain/);
  });

  it("parallel-execution.md требует сперва проверить собственные диспетчеризации", () => {
    const section = pxSection("Unaccounted state");

    expect(section).toMatch(/check your own dispatches first/);
    expect(section).toMatch(/subagent you started/);
    expect(section).toMatch(/the one case you answer for/);
  });

  it("parallel-execution.md требует остановиться и спросить пользователя, чьё это состояние", () => {
    const section = pxSection("Unaccounted state");

    expect(section).toMatch(/stop and ask the user whose it is/);
    expect(section).toMatch(/before any task closes on top of it/);
  });

  it("parallel-execution.md запрещает относить находку к чужой сессии, параллельному редактору, другому пользователю или фоновому инструменту", () => {
    const section = pxSection("Unaccounted state");

    expect(section).toMatch(
      /never attribute it to a foreign session, a parallel editor, another user, or a tool running in the background/,
    );
    expect(section).toMatch(/a claim about a person made with no evidence/);

    for (const phrase of ["is likely a parallel editor", "belongs to another session"]) {
      expect(section, `«${phrase}» приписывает находку постороннему`).not.toContain(phrase);
    }
  });

  it("parallel-execution.md останавливает работу над неучтённым состоянием: прогон и галочка на нём ничего не значат", () => {
    const section = pxSection("Unaccounted state");

    expect(section).toMatch(/work does not continue over it/);
    expect(section).toMatch(/measures nothing/);
    expect(section).toMatch(/a checkbox resting on it rests on nothing/);
  });

  it("SKILL.md несёт красный флаг про состояние в дереве, которое нельзя объяснить", () => {
    const redFlags = skillRedFlags();

    expect(redFlags).toMatch(/state in the tree you cannot account for/);
  });
});

