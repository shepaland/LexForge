import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readSkills, type SkillFile } from "../helpers/read-skills.js";
import { checkNamedCommands, knownCommandNames } from "./commands.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/skills-structure", import.meta.url));
const SKILLS = fileURLToPath(new URL("../../skills", import.meta.url));

function fixture(dir: string): SkillFile {
  const skill = readSkills(FIXTURES).find((entry) => entry.dir === dir);
  if (!skill) {
    throw new Error(`fixture ${dir} is missing`);
  }
  return skill;
}

describe("список команд читается из программы CLI", () => {
  it("несёт команды и подкоманды, зарегистрированные в run.ts", () => {
    expect(knownCommandNames().slice().sort()).toEqual([
      "change",
      "check",
      "init",
      "instructions",
      "new",
      "plan",
      "status",
      "validate",
    ]);
  });
});

describe("проверка команд на фикстурах", () => {
  it("команда из будущего этапа даёт находку с именем команды и файла", () => {
    const findings = checkNamedCommands(fixture("future-command"));

    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("unknown-command");
    expect(findings[0]!.message).toContain("archive");
    expect(findings[0]!.message).toContain("future-command/SKILL.md");
  });

  it("валидная фикстура находок не даёт", () => {
    expect(checkNamedCommands(fixture("minimal"))).toEqual([]);
  });

  it("команда внутри блока кода не проверяется", () => {
    const skill: SkillFile = {
      dir: "fenced",
      file: "/tmp/fenced/SKILL.md",
      frontmatter: {},
      body: ["Text before.", "", "```", "lexforge archive add-auth", "```", "", "Text after."].join(
        "\n",
      ),
    };

    expect(checkNamedCommands(skill)).toEqual([]);
  });

  it("одна и та же неизвестная команда даёт одну находку", () => {
    const skill: SkillFile = {
      dir: "twice",
      file: "/tmp/twice/SKILL.md",
      frontmatter: {},
      body: "Run `lexforge archive add-auth` and then `lexforge archive add-billing` again.",
    };

    expect(checkNamedCommands(skill).map((entry) => entry.message)).toHaveLength(1);
  });
});

describe("проверка команд на каталоге skills", () => {
  it("ни один скилл не называет команду, которой нет в CLI", () => {
    const findings = readSkills(SKILLS).flatMap((skill) => checkNamedCommands(skill));

    expect(findings.map((entry) => entry.message)).toEqual([]);
  });
});
