import { describe, expect, it } from "vitest";

import type { SkillFile } from "../helpers/read-skills.js";
import { checkSkillStructure } from "./checks.js";
import { bodyOf, fixture, only, pxSection } from "./helpers.js";

describe("раздел 14: lexforge-apply получает свой предел слов тела — 800 против общих 650", () => {
  it("фикстура lexforge-apply на 748 слов не даёт находки body-length", () => {
    const skill = fixture("lexforge-apply");

    expect(checkSkillStructure(skill)).toEqual([]);
  });

  it("тело lexforge-apply в 801 слово всё же даёт находку body-length с пределом 800", () => {
    const skill: SkillFile = {
      dir: "lexforge-apply",
      file: "/fixture/lexforge-apply/SKILL.md",
      frontmatter: { name: "lexforge-apply", description: "Use when testing the 800-word edge" },
      body: Array.from({ length: 801 }, () => "word").join(" "),
    };

    const finding = only(checkSkillStructure(skill));

    expect(finding.rule).toBe("body-length");
    expect(finding.message).toContain("801");
    expect(finding.message).toContain("800");
  });

  it("тело lexforge-apply ссылается на parallel.md", () => {
    expect(bodyOf("lexforge-apply")).toMatch(/\[parallel\.md\]\(parallel\.md\)/);
  });

  it("MINOR из ревью попадает в lexforge defect record сейчас, а не в новую задачу плана потом", () => {
    const body = bodyOf("lexforge-apply");
    const lower = body.toLowerCase();
    const minorIndex = lower.indexOf("minor");

    expect(minorIndex, "MINOR не названо в теле lexforge-apply").toBeGreaterThan(-1);

    const sentence = lower.slice(minorIndex, minorIndex + 200);

    expect(sentence).toMatch(/\bnow\b/);
    expect(sentence).toMatch(/lexforge defect record/);

    for (const phrase of [
      "numbered task",
      "fresh task",
      "new task",
      "for later",
      "needs no",
      "no need",
      "keep it in mind",
      "kept in mind",
    ]) {
      expect(sentence, `«${phrase}» рядом с MINOR ослабляет требование`).not.toContain(phrase);
    }
  });
});

describe("parallel.md: проверка рантайма на исполнителей и на ревью до первой задачи", () => {
  it("parallel.md реально проверяет рантайм на исполнителей и на ревью до первой задачи", () => {
    const text = pxSection("The runtime check");

    expect(text).toMatch(/before your first task|before task 1/);
    expect(text).toMatch(/executor subagent/);
    expect(text).toMatch(/sequential/);
    expect(text).toMatch(/establish two things:/);
    expect(text).toMatch(/whether it can reach any agent at all\./);

    for (const phrase of [
      "establish three things",
      "start a reviewer of its own",
      "can start a reviewer",
    ]) {
      expect(text, `«${phrase}» — снятый вопрос ещё жив в «The runtime check»`).not.toContain(phrase);
    }

    const establishIndex = text.indexOf("establish");
    expect(establishIndex, "нет слова «establish»").toBeGreaterThan(-1);

    const around = text.slice(Math.max(0, establishIndex - 20), establishIndex + 20);
    expect(around).not.toMatch(/no need to|need not|not need to|no reason to/);

    for (const phrase of [
      "no need",
      "say nothing",
      "nothing either way",
      "skip the check",
      "optional",
    ]) {
      expect(text, `«${phrase}» рядом с проверкой рантайма`).not.toContain(phrase);
    }
  });

  it("без агента вовсе кладёт на стол два законных выхода из недостижимого ревьюера", () => {
    const text = pxSection("The runtime check");

    expect(text).toMatch(/make a reviewer reachable/);
    expect(text).toMatch(/strike the task from the plan with their word through\s*`lexforge plan amend`/);
    expect(text).toMatch(
      /struck meaning the task is dropped and its work with it, never\s*that the work stands and the review is waived/,
    );
    expect(text).toMatch(/reading your own diff does not stand\s*for the review|reading your own diff does not stand\s*in\s*for the review/);
    expect(text).toMatch(/the absence of a reviewer is not a reason to run `task\s*close`/);

    for (const phrase of [
      "the work stands and the review follows later",
      "approve it yourself this once",
      "the review can wait until a reviewer turns up",
    ]) {
      expect(text, `«${phrase}» подменяет один из двух законных выходов`).not.toContain(phrase);
    }
  });

  it("не пускает следующую задачу, пока эта стоит без ревью", () => {
    const text = pxSection("The runtime check");

    expect(text).toMatch(/no\s*further task starts while this one stands unreviewed/);

    for (const phrase of [
      "a later task may start if it touches no file of this one",
      "the next task can start while this one waits on its reviewer",
    ]) {
      expect(text, `«${phrase}» открывает задачу поверх неревьюированной`).not.toContain(phrase);
    }
  });
});
