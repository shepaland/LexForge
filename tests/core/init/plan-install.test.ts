import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import { renderManifest } from "../../../src/core/init/install-manifest.js";
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

    expect(plan.files.map((entry) => entry.path).sort()).toEqual([
      path.join(root, ".claude/skills/sample-plan/SKILL.md"),
      path.join(root, ".claude/skills/sample-verify/SKILL.md"),
    ]);
    for (const entry of plan.files) {
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
    for (const name of ["agents", "claude", "codex", "cursor", "opencode"]) {
      expect(error.message).toContain(name);
    }
  });

  it("на опечатку в списке не оставляет на диске ни одного файла", () => {
    const root = project();

    expect(() =>
      planSkillInstall({ root, tools: ["claude", "cursr"], skillsDir: SKILLS_DIR }),
    ).toThrow(UsageError);
    expect(existsSync(path.join(root, ".claude"))).toBe(false);
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
    const states = new Map(plan.files.map((entry) => [entry.path, entry.state]));

    expect(states.get(path.join(root, ".claude/skills/sample-plan/SKILL.md"))).toBe("unchanged");
    expect(states.get(path.join(root, ".claude/skills/sample-verify/SKILL.md"))).toBe("updated");
    expect(states.get(path.join(root, ".codex/skills/sample-plan/SKILL.md"))).toBe("unchanged");
    expect(states.get(path.join(root, ".codex/skills/sample-verify/SKILL.md"))).toBe("created");
  });
});

describe("planSkillInstall, область установки", () => {
  it("на проектную область для cursor ведёт в .cursor/skills", () => {
    const root = project();

    const plan = planSkillInstall({
      root,
      tools: ["cursor"],
      scope: "project",
      skillsDir: SKILLS_DIR,
    });

    expect(plan.files.map((entry) => entry.path).sort()).toEqual([
      path.join(root, ".cursor/skills/sample-plan/SKILL.md"),
      path.join(root, ".cursor/skills/sample-verify/SKILL.md"),
    ]);
  });

  it("на пользовательскую область ведёт под переданный домашний каталог", () => {
    const root = project();
    const home = project();

    const plan = planSkillInstall({
      root,
      tools: ["opencode"],
      scope: "user",
      home,
      skillsDir: SKILLS_DIR,
    });

    expect(plan.files.map((entry) => entry.path).sort()).toEqual([
      path.join(home, ".config/opencode/skills/sample-plan/SKILL.md"),
      path.join(home, ".config/opencode/skills/sample-verify/SKILL.md"),
    ]);
  });
});

/** A manifest of a previous installation, as `renderManifest` writes it. */
function previousManifest(files: string[]): string {
  return renderManifest({
    version: "0.9.0",
    installedAt: "2026-08-01T00:00:00.000Z",
    tool: "claude",
    scope: "project",
    files,
  });
}

describe("planSkillInstall, уборка прошлой версии", () => {
  it("несёт в removed файл, который прошлый манифест назвал, а пакет не несёт", () => {
    const root = project({
      ".claude/lexforge-install.json": previousManifest([
        "sample-plan/SKILL.md",
        "sample-retired/SKILL.md",
      ]),
      ".claude/skills/sample-retired/SKILL.md": "a skill of the previous version\n",
    });

    const plan = planSkillInstall({ root, tools: ["claude"], skillsDir: SKILLS_DIR });

    expect(plan.removed).toEqual([
      path.join(root, ".claude/skills/sample-retired/SKILL.md"),
    ]);
  });

  it("не несёт в removed то, что пакет ставит и сейчас", () => {
    const root = project({
      ".claude/lexforge-install.json": previousManifest([
        "sample-plan/SKILL.md",
        "sample-verify/SKILL.md",
      ]),
    });

    const plan = planSkillInstall({ root, tools: ["claude"], skillsDir: SKILLS_DIR });

    expect(plan.removed).toEqual([]);
  });

  it("не трогает каталог, которого прошлый манифест не называл", () => {
    const root = project({
      ".claude/lexforge-install.json": previousManifest(["sample-plan/SKILL.md"]),
      ".claude/skills/my-own-skill/SKILL.md": "a skill of my own\n",
    });

    const plan = planSkillInstall({ root, tools: ["claude"], skillsDir: SKILLS_DIR });

    expect(plan.removed).toEqual([]);
    expect(existsSync(path.join(root, ".claude/skills/my-own-skill/SKILL.md"))).toBe(true);
  });
});

describe("planSkillInstall, установка без манифеста", () => {
  it("ничего не удаляет и называет каталоги прошлых скиллов LexForge", () => {
    const root = project({
      ".claude/skills/lexforge-retired/SKILL.md": "a skill of a version without a manifest\n",
      ".claude/skills/my-own-skill/SKILL.md": "a skill of my own\n",
    });

    const plan = planSkillInstall({ root, tools: ["claude"], skillsDir: SKILLS_DIR });

    expect(plan.removed).toEqual([]);
    expect(plan.unmanaged).toEqual([path.join(root, ".claude/skills/lexforge-retired")]);
  });
});

describe("planSkillInstall, опустевший каталог", () => {
  it("несёт каталог скилла к удалению, когда уходит его последний файл", () => {
    const root = project({
      ".claude/lexforge-install.json": previousManifest(["sample-retired/SKILL.md"]),
      ".claude/skills/sample-retired/SKILL.md": "the last file of a retired skill\n",
    });

    const plan = planSkillInstall({ root, tools: ["claude"], skillsDir: SKILLS_DIR });

    expect(plan.emptied).toEqual([path.join(root, ".claude/skills/sample-retired")]);
  });

  it("оставляет каталог, в котором после удаления что-то остаётся", () => {
    const root = project({
      ".claude/lexforge-install.json": previousManifest(["sample-retired/SKILL.md"]),
      ".claude/skills/sample-retired/SKILL.md": "the file this version drops\n",
      ".claude/skills/sample-retired/notes.md": "a file a person put there\n",
    });

    const plan = planSkillInstall({ root, tools: ["claude"], skillsDir: SKILLS_DIR });

    expect(plan.removed).toEqual([
      path.join(root, ".claude/skills/sample-retired/SKILL.md"),
    ]);
    expect(plan.emptied).toEqual([]);
  });
});
