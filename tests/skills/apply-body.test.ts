import { describe, expect, it } from "vitest";

import { readSkills, type SkillFile } from "../helpers/read-skills.js";
import { checkSkillStructure } from "./checks.js";
import { SKILLS, bodyOf, fixture, only, pxSection } from "./helpers.js";

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

  it("SKILL.md lexforge-apply не велит исполнителю самому слать ревьюера — кто шлёт бриф и что делает вместо этого исполнитель названо в parallel-execution.md", () => {
    const skill = readSkills(SKILLS).find((entry) => entry.dir === "lexforge-apply")!;

    expect(skill.body).toMatch(
      /who sends it and what a dispatched executor\s+does instead is in \[parallel-execution\.md\]\(parallel-execution\.md\)\./,
    );
    expect(skill.body).not.toMatch(/send a reviewer subagent the brief/);
    expect(skill.body).not.toMatch(/Only a reviewer[^.]*banned by type/);
  });

  it("тело lexforge-apply ссылается на parallel-execution.md", () => {
    expect(bodyOf("lexforge-apply")).toMatch(/\[parallel-execution\.md\]\(parallel-execution\.md\)/);
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

describe("раздел 15: lexforge-apply называет lexforge evidence red шагом перед реализацией", () => {
  /**
   * The `## The rule` section with whitespace runs (including a mid-sentence
   * line wrap) collapsed to a single space, so a source line wrap cannot
   * break a phrase match.
   */
  function ruleSection(): string {
    const body = readSkills(SKILLS)
      .find((entry) => entry.dir === "lexforge-apply")!
      .body.replace(/\s+/g, " ");
    const start = body.indexOf("## The rule");

    expect(start, "раздел «The rule» не найден").toBeGreaterThan(-1);

    const next = body.indexOf("## ", start + 3);
    return next === -1 ? body.slice(start) : body.slice(start, next);
  }

  it("«The rule» называет lexforge evidence red шагом перед реализацией, без смягчения порядка", () => {
    const rule = ruleSection();

    expect(rule).toMatch(/lexforge evidence red --change/);
    expect(rule).toMatch(/--task/);
    expect(rule).toMatch(/--command/);
    // The mandate as a whole - "is" the step, not merely a sentence that
    // happens to contain the substring "before the implementation".
    expect(rule).toMatch(
      /The step before the implementation is `lexforge evidence red --change` naming this change, `--task` naming this task, `--command` naming the failing check: it runs the check itself and writes the record\./,
    );

    for (const phrase of [
      "need not",
      "not need to",
      "no need to",
      "optional",
      "at some point",
      "unless",
      "if you can",
      "doesn't have to",
    ]) {
      expect(rule, `«${phrase}» смягчает порядок шага`).not.toContain(phrase);
    }
  });

  it("«The rule» называет наблюдателем провала того, кто пишет реализацию, и отказывает трём заменам", () => {
    const rule = ruleSection();
    const observerIndex = rule.indexOf(
      "The observer of the failure is whoever writes the implementation",
    );

    expect(observerIndex, "«observer of the failure» не найдено").toBeGreaterThan(-1);

    const window = rule.slice(observerIndex, observerIndex + 420);

    // The requirement's three refusals (implementation-loop/spec.md: "A failure
    // reported by another agent, summarised from another agent's output, or
    // reasoned about from the code SHALL NOT count as observed") - each named,
    // not just the headline clause.
    expect(window).toMatch(/reported by another agent/);
    expect(window).toMatch(/summarised from another agent's output/);
    expect(window).toMatch(/reasoned about from the code/);

    for (const phrase of [
      "unless a subagent already ran it",
      "unless it already ran",
      "except when a subagent",
      "as long as someone watched it",
    ]) {
      expect(window, `«${phrase}» открывает исключение наблюдателю`).not.toContain(phrase);
    }
  });

  it("«The rule» говорит, что значит вычеркнуть задачу: работа снимается вместе с ней, а не остаётся без ревью", () => {
    const rule = ruleSection();

    expect(rule).toMatch(
      /Struck means the task is dropped and its work with it, never that the work stands and the review is waived\./,
    );

    for (const phrase of [
      "the work stays and the review is skipped",
      "the code stays in the tree",
      "strike just removes the checkbox",
    ]) {
      expect(rule, `«${phrase}» оставляет вычеркнутую работу в дереве`).not.toContain(phrase);
    }
  });
});

describe("parallel-execution.md: проверка рантайма на исполнителей и на ревью до первой задачи", () => {
  it("parallel-execution.md реально проверяет рантайм на исполнителей и на ревью до первой задачи", () => {
    const text = pxSection("The runtime check");

    expect(text).toMatch(/before your first task|before task 1/);
    expect(text).toMatch(/executor subagent/);
    expect(text).toMatch(/sequential/);
    // Round 6: "Whether an executor can review itself" is gone (see
    // tests/skills/apply-waves.test.ts) and its runtime-dependent branch
    // with it - the executor never starts a reviewer of its own regardless
    // of what the runtime can reach, so the check no longer asks that
    // question. It establishes two things now, not three.
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
});

