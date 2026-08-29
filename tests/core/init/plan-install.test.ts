import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import { planSkillInstall } from "../../../src/core/init/plan-install.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const SKILLS_DIR = fileURLToPath(new URL("../../fixtures/skills", import.meta.url));

const created: string[] = [];

function project(files: Record<string, string> = {}): string {
  const root = makeWorkspace(files);
  created.push(root);
  return root;
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

describe("planSkillInstall", () => {
  it("на один инструмент даёт по записи на каждый скилл внутри его каталога", () => {
    const root = project();

    const plan = planSkillInstall({ root, tools: ["claude"], skillsDir: SKILLS_DIR });

    expect(plan.map((entry) => entry.path).sort()).toEqual([
      path.join(root, ".claude/skills/sample-plan/SKILL.md"),
      path.join(root, ".claude/skills/sample-verify/SKILL.md"),
    ]);
    for (const entry of plan) {
      expect(entry.state).toBe("created");
      expect(entry.content).toContain("Next step:");
    }
  });

  it("неизвестное имя инструмента останавливает работу и перечисляет поддерживаемые", () => {
    const root = project();

    let caught: unknown;
    try {
      planSkillInstall({ root, tools: ["claude", "nosuch"], skillsDir: SKILLS_DIR });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(UsageError);
    const error = caught as UsageError;
    expect(error.code).toBe("tool-unknown");
    expect(error.message).toContain("nosuch");
    for (const name of ["agents", "claude", "codex"]) {
      expect(error.message).toContain(name);
    }
  });
});

describe("planSkillInstall, состояния записи", () => {
  it("различает created, updated и unchanged", () => {
    const shipped = readFileSync(path.join(SKILLS_DIR, "sample-plan/SKILL.md"), "utf8");
    const root = project({
      ".claude/skills/sample-plan/SKILL.md": shipped,
      ".claude/skills/sample-verify/SKILL.md": "an older skill someone edited by hand\n",
      ".codex/skills/sample-plan/SKILL.md": shipped,
    });

    const plan = planSkillInstall({
      root,
      tools: ["claude", "codex"],
      skillsDir: SKILLS_DIR,
    });
    const states = new Map(plan.map((entry) => [entry.path, entry.state]));

    expect(states.get(path.join(root, ".claude/skills/sample-plan/SKILL.md"))).toBe("unchanged");
    expect(states.get(path.join(root, ".claude/skills/sample-verify/SKILL.md"))).toBe("updated");
    expect(states.get(path.join(root, ".codex/skills/sample-plan/SKILL.md"))).toBe("unchanged");
    expect(states.get(path.join(root, ".codex/skills/sample-verify/SKILL.md"))).toBe("created");
  });
});
