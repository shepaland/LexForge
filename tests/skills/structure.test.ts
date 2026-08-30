import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readSkills, type SkillFile } from "../helpers/read-skills.js";
import {
  IMPLEMENTATION_SKILLS,
  MAX_BODY_WORDS,
  MAX_DESCRIPTION_CHARS,
  PLANNING_SKILLS,
  QUEUE_RULE_IMPLEMENTATION_SKILLS,
  SKILLS_WITHOUT_QUEUE_RULE,
  checkSkillStructure,
  readQueueRule,
  type SkillFinding,
} from "./checks.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/skills-structure", import.meta.url));
const SKILLS = fileURLToPath(new URL("../../skills", import.meta.url));

function fixture(dir: string): SkillFile {
  const skill = readSkills(FIXTURES).find((entry) => entry.dir === dir);
  if (!skill) {
    throw new Error(`fixture ${dir} is missing`);
  }
  return skill;
}

function only(findings: SkillFinding[]): SkillFinding {
  expect(findings).toHaveLength(1);
  return findings[0]!;
}

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
    expect(finding.message).toContain(String(MAX_BODY_WORDS));
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

describe("общий блок правила очереди", () => {
  function blocksOf(group: string[], dir = SKILLS): { dir: string; text: string | null }[] {
    const skills = readSkills(dir).filter((skill) => group.includes(skill.dir));
    const missing = group.filter((name) => !skills.some((skill) => skill.dir === name));

    expect(missing).toEqual([]);

    return skills.map((skill) => ({ dir: skill.dir, text: readQueueRule(skill) }));
  }

  function sharedText(group: string[], dir = SKILLS): string {
    const blocks = blocksOf(group, dir);

    expect(blocks.filter((block) => block.text === null).map((block) => block.dir)).toEqual([]);
    expect(blocks).toHaveLength(group.length);

    const first = blocks[0]!;
    // The list names the file: a skill left with the old text shows up by its directory.
    expect(blocks.filter((block) => block.text !== first.text).map((block) => block.dir)).toEqual(
      [],
    );

    return first.text!;
  }

  it("совпадает посимвольно у пяти скиллов планирования", () => {
    expect(sharedText(PLANNING_SKILLS)).toContain("Queue rule");
  });

  it("совпадает посимвольно у трёх скиллов реализации, работающих на change", () => {
    expect(sharedText(QUEUE_RULE_IMPLEMENTATION_SKILLS)).toContain("Queue rule");
  });

  it("у двух групп разный: планирование читает артефакт, реализация — весь план", () => {
    expect(sharedText(QUEUE_RULE_IMPLEMENTATION_SKILLS)).not.toBe(sharedText(PLANNING_SKILLS));
  });

  it("скилл отладки блока не несёт: он срабатывает и там, где рабочего пространства нет", () => {
    expect(blocksOf(SKILLS_WITHOUT_QUEUE_RULE)).toEqual(
      SKILLS_WITHOUT_QUEUE_RULE.map((dir) => ({ dir, text: null })),
    );
  });

  it("группы блока и каталог скиллов сходятся", () => {
    expect([...QUEUE_RULE_IMPLEMENTATION_SKILLS, ...SKILLS_WITHOUT_QUEUE_RULE].sort()).toEqual(
      IMPLEMENTATION_SKILLS.slice().sort(),
    );
  });
});
