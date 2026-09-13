import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readSkills } from "../helpers/read-skills.js";
import {
  IMPLEMENTATION_SKILLS,
  MAX_DESCRIPTION_CHARS,
  PLANNING_SKILLS,
  maxBodyWords,
  checkSkillStructure,
} from "./checks.js";
import { SKILLS, fixture, only } from "./helpers.js";

describe("проверки структуры на фикстурах", () => {
  it("три поля во фронтматтере дают находку frontmatter-fields", () => {
    const finding = only(checkSkillStructure(fixture("three-fields")));

    expect(finding.rule).toBe("frontmatter-fields");
    expect(finding.message).toContain("three-fields/SKILL.md");
    expect(finding.message).toContain("version");
  });

  it("имя, разошедшееся с каталогом, даёт находку name-mismatch с обоими значениями", () => {
    const finding = only(checkSkillStructure(fixture("name-mismatch")));

    expect(finding.rule).toBe("name-mismatch");
    expect(finding.message).toContain("name-mismatch/SKILL.md");
    expect(finding.message).toContain("another-name");
  });

  it("описание не со слов Use when даёт находку description-opening", () => {
    const finding = only(checkSkillStructure(fixture("no-use-when")));

    expect(finding.rule).toBe("description-opening");
    expect(finding.message).toContain("no-use-when/SKILL.md");
    expect(finding.message).toContain("Use when");
  });

  it("описание длиннее предела даёт находку description-length с длиной", () => {
    const skill = fixture("long-description");
    const finding = only(checkSkillStructure(skill));

    expect(finding.rule).toBe("description-length");
    expect(finding.message).toContain("long-description/SKILL.md");
    expect(finding.message).toContain(String(MAX_DESCRIPTION_CHARS));
    expect(finding.message).toContain(String(`${skill.frontmatter.description}`.length));
  });

  it("тело длиннее предела даёт находку body-length с длиной", () => {
    const skill = fixture("long-body");
    const finding = only(checkSkillStructure(skill));

    expect(finding.rule).toBe("body-length");
    expect(finding.message).toContain("long-body/SKILL.md");
    expect(finding.message).toContain(String(maxBodyWords(skill)));
    expect(finding.message).toContain(String(skill.body.split(/\s+/).filter(Boolean).length));
  });

  it("валидная фикстура находок не даёт", () => {
    expect(checkSkillStructure(fixture("minimal"))).toEqual([]);
  });

  it("фикстура с командой из будущего этапа проходит проверки структуры", () => {
    expect(checkSkillStructure(fixture("future-command"))).toEqual([]);
  });
});

describe("проверки структуры на каталоге skills", () => {
  it("ни один скилл не даёт находок", () => {
    const findings = readSkills(SKILLS).flatMap((skill) => checkSkillStructure(skill));

    expect(findings.map((finding) => finding.message)).toEqual([]);
  });

  it("в каталоге лежат девять скиллов: пять планирующих и четыре реализующих", () => {
    const dirs = readSkills(SKILLS).map((skill) => skill.dir);

    expect(dirs.slice().sort()).toEqual(
      [...PLANNING_SKILLS, ...IMPLEMENTATION_SKILLS].slice().sort(),
    );
  });
});

describe("скилл проектирования и шаблон design", () => {
  const NUMBER_WORDS = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
  ];

  it("называет столько разделов, сколько заголовков несёт шаблон", () => {
    const template = readFileSync(
      fileURLToPath(new URL("../../schemas/spec-driven/templates/design.md", import.meta.url)),
      "utf8",
    );
    const headings = template.match(/^## .+$/gm) ?? [];
    const skill = readSkills(SKILLS).find((entry) => entry.dir === "lexforge-design");

    expect(skill, "скилла lexforge-design нет в каталоге").toBeTruthy();
    expect(headings.length).toBeGreaterThan(0);

    // Разделы и ответы считаются вместе: ответ даётся на раздел, и число
    // у них одно. «one answer» — про один ответ, а не про их число, и в счёт
    // не идёт.
    const named = [...skill!.body.matchAll(/\b([a-z]+) (?:sections|answers)\b/g)]
      .map((match) => match[1]!)
      .filter((word) => word !== "one");

    expect(named.length).toBeGreaterThan(0);
    expect([...new Set(named)]).toEqual([NUMBER_WORDS[headings.length]]);
  });
});

