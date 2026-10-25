import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readSkills, type SkillFile } from "../helpers/read-skills.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";
import { checkNamedCommands, knownCommandNames, namedCommands } from "./commands.js";

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
      "abandon",
      "add",
      "add",
      "amend",
      "approve",
      "archive",
      "change",
      "check",
      "close",
      "close",
      "defect",
      "doctor",
      "escalate",
      "evidence",
      "evidence",
      "final",
      "find",
      "green",
      "init",
      "instructions",
      "journal",
      "list",
      "migrate",
      "new",
      "plan",
      "plan",
      "record",
      "record",
      "red",
      "resolve",
      "resume",
      "review",
      "review",
      "review",
      "rules",
      "session",
      "set",
      "set",
      "stacks",
      "start",
      "status",
      "stores",
      "styles",
      "task",
      "unlock",
      "validate",
      "verify",
    ]);
  });
});

describe("проверка команд на фикстурах", () => {
  it("команда из будущего этапа даёт находку с именем команды и файла", () => {
    const findings = checkNamedCommands(fixture("future-command"));

    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("unknown-command");
    expect(findings[0]!.message).toContain("publish");
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
      body: ["Text before.", "", "```", "lexforge publish add-auth", "```", "", "Text after."].join(
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
      body: "Run `lexforge publish add-auth` and then `lexforge publish add-billing` again.",
    };

    expect(checkNamedCommands(skill).map((entry) => entry.message)).toHaveLength(1);
  });

  it("известная команда с подкомандой, которой у неё нет, даёт находку", () => {
    const skill: SkillFile = {
      dir: "bad-pair",
      file: "/tmp/bad-pair/SKILL.md",
      frontmatter: {},
      body: "A lock left by a dead process is removed with `lexforge task unlock`.",
    };

    const findings = checkNamedCommands(skill);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("unknown-command");
    expect(findings[0]!.message).toContain("task unlock");
  });

  it("подкоманда, которую CLI действительно регистрирует под этой командой, находки не даёт", () => {
    const skill: SkillFile = {
      dir: "good-pair",
      file: "/tmp/good-pair/SKILL.md",
      frontmatter: {},
      body: "Run `lexforge task start`, then `lexforge unlock --change demo` if the lock is stale.",
    };

    expect(checkNamedCommands(skill)).toEqual([]);
  });

  it("команда в файле рядом с SKILL.md тоже проверяется", () => {
    const root = makeWorkspace({
      "companion/parallel.md": "A lock left by a dead process is removed with `lexforge task unlock`.\n",
    });

    try {
      const skill: SkillFile = {
        dir: "companion",
        file: path.join(root, "companion", "SKILL.md"),
        frontmatter: {},
        body: "Nothing in this body names a stale command.",
      };

      const findings = checkNamedCommands(skill);

      expect(findings).toHaveLength(1);
      expect(findings[0]!.message).toContain("parallel.md");
      expect(findings[0]!.message).toContain("task unlock");
    } finally {
      removeWorkspace(root);
    }
  });

  it("блок кода в файле рядом с SKILL.md не образец вывода, а сам промпт - он проверяется целиком", () => {
    const root = makeWorkspace({
      "prompt/parallel.md": ["```", "Run `lexforge task unlock` to clear the lock.", "```", ""].join("\n"),
    });

    try {
      const skill: SkillFile = {
        dir: "prompt",
        file: path.join(root, "prompt", "SKILL.md"),
        frontmatter: {},
        body: "Nothing in this body names a stale command.",
      };

      const findings = checkNamedCommands(skill);

      expect(findings).toHaveLength(1);
      expect(findings[0]!.message).toContain("parallel.md");
      expect(findings[0]!.message).toContain("task unlock");
    } finally {
      removeWorkspace(root);
    }
  });
});

describe("перенос строки в вызове не обрывает команду и подкоманду", () => {
  const WRAPPED_CALLS: Array<{ path: string; command: string; subcommand: string }> = [
    { path: "../../skills/lexforge/SKILL.md", command: "task", subcommand: "start" },
    { path: "../../skills/lexforge-plan/plan-reviewer-prompt.md", command: "check", subcommand: "plan" },
    { path: "../../skills/lexforge-plan/plan-file-per-section.md", command: "task", subcommand: "start" },
  ];

  it.each(WRAPPED_CALLS)(
    "$path несёт пару «$command $subcommand», хотя markdown переносит строку между ними",
    ({ path: relativePath, command, subcommand }) => {
      const text = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
      const calls = namedCommands(text);

      expect(calls).toEqual(expect.arrayContaining([expect.objectContaining({ command, subcommand })]));
    },
  );

  it("перенос строки внутри самой убранной команды не прячет её от проверки", () => {
    const skill: SkillFile = {
      dir: "wrapped-bad-pair",
      file: "/tmp/wrapped-bad-pair/SKILL.md",
      frontmatter: {},
      body: "A lock left by a dead process is removed with `lexforge task\nunlock`.",
    };

    const findings = checkNamedCommands(skill);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("unknown-command");
    expect(findings[0]!.message).toContain("task unlock");
  });
});

describe("проверка команд на каталоге skills", () => {
  it("ни один скилл не называет команду, которой нет в CLI", () => {
    const findings = readSkills(SKILLS).flatMap((skill) => checkNamedCommands(skill));

    expect(findings.map((entry) => entry.message)).toEqual([]);
  });
});

describe("флаг рантайма в командах скиллов", () => {
  const READS_ASSIGNMENT = /lexforge (instructions|status)[^\n`]*/g;

  /**
   * The flag is asked of the calls that resolve an assignment: every
   * `instructions`, and every `status` of one change. `lexforge status` without
   * `--change` lists the workspace and resolves nothing, so the CLI has nowhere
   * to put a runtime name and the skills do not write one.
   */
  function resolvesAssignment(call: string): boolean {
    return call.includes("instructions") || call.includes("--change");
  }

  it("каждый вызов, читающий назначение, несёт --tool", () => {
    const findings: string[] = [];

    for (const skill of readSkills(SKILLS)) {
      for (const call of skill.body.match(READS_ASSIGNMENT) ?? []) {
        if (resolvesAssignment(call) && !call.includes("--tool")) {
          findings.push(`${skill.dir}: ${call.trim()}`);
        }
      }
    }

    expect(findings).toEqual([]);
  });

  it("перечисление рабочей области флага не несёт", () => {
    const findings: string[] = [];

    for (const skill of readSkills(SKILLS)) {
      for (const call of skill.body.match(READS_ASSIGNMENT) ?? []) {
        if (!resolvesAssignment(call) && call.includes("--tool")) {
          findings.push(`${skill.dir}: ${call.trim()}`);
        }
      }
    }

    expect(findings).toEqual([]);
  });
});
