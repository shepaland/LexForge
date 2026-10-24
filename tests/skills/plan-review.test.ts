import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** A file of the plan skill; a missing one reads as empty, so the assertion names what is absent. */
function read(name: string): string {
  const file = fileURLToPath(new URL(`../../skills/lexforge-plan/${name}`, import.meta.url));
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

/** The `## Work` section of SKILL.md, whitespace runs collapsed to one space. */
function workSection(): string {
  const body = read("SKILL.md");
  const start = body.indexOf("## Work");
  expect(start, "раздел «Work» не найден в SKILL.md").toBeGreaterThan(-1);
  return body.slice(start).replace(/\s+/g, " ");
}

function reviewerPromptText(): string {
  return read("plan-reviewer-prompt.md").replace(/\s+/g, " ");
}

function digestText(): string {
  return read("digest.md");
}

/** `digest.md` with a source line wrap collapsed to one space, for a phrase that spans a wrap. */
function digestFlat(): string {
  return digestText().replace(/\s+/g, " ");
}

describe("раздел «Work»: четыре угла до одобрения", () => {
  it("четыре угла названы, и их отправка в тексте стоит раньше команды одобрения", () => {
    const text = workSection();

    for (const angle of ["specs", "code", "dependencies", "gaps"]) {
      expect(text, `угол «${angle}» не назван в разделе «Work»`).toContain(`\`${angle}\``);
    }

    const angleIndex = text.indexOf("one per angle");
    const approveIndex = text.indexOf("lexforge plan approve");

    expect(angleIndex, "отправка по углам не описана в «Work»").toBeGreaterThan(-1);
    expect(approveIndex, "команда одобрения не названа в «Work»").toBeGreaterThan(-1);
    expect(angleIndex, "отправка по углам стоит после команды одобрения").toBeLessThan(approveIndex);
  });

  it("одобрение прямо ждёт все четыре угла, а не один", () => {
    const text = workSection();

    expect(text).toMatch(/Approval waits until all four angles approved the current plan\./);

    for (const phrase of [
      "approval waits until one angle approved the current plan",
      "the owner may be asked once the first angle approves",
    ]) {
      expect(text, `«${phrase}» разрешает одобрение до всех четырёх углов`).not.toContain(phrase);
    }
  });
});

describe("раздел «Work»: правка находки возвращает все четыре угла, а не один", () => {
  it("текст раздела прямо называет все четыре угла, не только тот, что нашёл находку", () => {
    const text = workSection();

    expect(text).toMatch(/sending all four angles a new review, not only the one that found it/);

    for (const phrase of ["sending that one angle a new review", "register that angle again"]) {
      expect(text, `«${phrase}» возвращает после правки только один угол`).not.toContain(phrase);
    }
  });

  it("то же правило повторено в plan-reviewer-prompt.md при регистрации отчёта", () => {
    const text = reviewerPromptText();

    expect(text).toMatch(/send every angle a new review, not only the one that found it/);
    expect(text).toMatch(/an angle approved before the fix is asked again too/);

    for (const phrase of ["send that angle a new review", "register that angle again"]) {
      expect(text, `«${phrase}» возвращает после правки только один угол`).not.toContain(phrase);
    }
  });
});

describe("plan-reviewer-prompt.md: раздел amendment рядом с четырьмя углами", () => {
  it("amendment идёт в списке углов и запускается только после lexforge plan amend", () => {
    const text = reviewerPromptText();

    expect(text.indexOf("amendment (only when"), "раздел amendment отсутствует в plan-reviewer-prompt.md").toBeGreaterThan(-1);
    expect(text).toMatch(/amendment \(only when the session asks for it after `lexforge plan amend`\)/);
    expect(text).toMatch(/--angle amendment --file <report\.md>/);

    for (const phrase of [
      "amendment, reviewed on every plan change",
      "the amendment section runs on every review, not only after an amendment",
    ]) {
      expect(text, `«${phrase}» запускает amendment без lexforge plan amend`).not.toContain(phrase);
    }
  });
});

describe("digest.md: порядок решений, углов и ссылки на tasks.md", () => {
  it("решения агента, затем вердикты четырёх углов, затем ссылка на tasks.md - именно в этом порядке", () => {
    const text = digestText();
    const decisionsIndex = text.search(/^1\. Decisions I made\./m);
    const reviewsIndex = text.search(/^2\. Reviews\./m);
    const planIndex = text.search(/^3\. The plan\./m);

    expect(decisionsIndex, "пункт «1. Decisions I made.» отсутствует").toBeGreaterThan(-1);
    expect(reviewsIndex, "пункт «2. Reviews.» отсутствует").toBeGreaterThan(-1);
    expect(planIndex, "пункт «3. The plan.» отсутствует").toBeGreaterThan(-1);
    expect(decisionsIndex, "решения стоят после вердиктов").toBeLessThan(reviewsIndex);
    expect(reviewsIndex, "вердикты стоят после ссылки на план").toBeLessThan(planIndex);
  });

  it("решения, меняющие видимое поведение, идут первыми внутри своего пункта", () => {
    const text = digestFlat();

    expect(text).toMatch(/Put first the ones that change what a user, a client or another system sees/);

    for (const phrase of ["Put last the ones that change what a user", "the internal ones first"]) {
      expect(text, `«${phrase}» ставит поведенческие решения не первыми`).not.toContain(phrase);
    }
  });

  it("вердикт каждого угла несёт число закрытых находок, а не только сам вердикт", () => {
    const text = digestFlat();

    expect(text).toMatch(/each with its verdict and the number of findings it closed, by level/);

    for (const phrase of ["each with its verdict, with no count of findings"]) {
      expect(text, `«${phrase}» опускает число закрытых находок`).not.toContain(phrase);
    }
  });

  it("одобрение несёт слова владельца как есть, а не пересказ", () => {
    const skillWork = workSection();
    const digest = digestText();

    expect(skillWork).toMatch(/run `lexforge plan approve --change <name> --quote "<owner's\s+words>"`/);
    expect(digest).toMatch(
      /Approval is `lexforge plan approve --change <name> --quote "<owner's words>"`, the words\s+copied as written\./,
    );

    for (const phrase of ["the words summarised in your own terms", "a paraphrase of the owner's answer"]) {
      expect(digest, `«${phrase}» разрешает пересказ вместо цитаты`).not.toContain(phrase);
    }
  });
});
