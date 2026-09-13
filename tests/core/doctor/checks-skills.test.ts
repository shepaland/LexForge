import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { answerPath } from "../../../src/core/answer-path.js";
import { manifestPath, renderManifest } from "../../../src/core/init/install-manifest.js";
import type { InstallScope } from "../../../src/core/init/tool-registry.js";
import { toolDirectory } from "../../../src/core/init/tool-registry.js";
import { checkSkills } from "../../../src/core/doctor/checks-skills.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const SKILLS_DIR = fileURLToPath(new URL("../../fixtures/skills", import.meta.url));
const SHIPPED_FILES = ["sample-plan/SKILL.md", "sample-verify/SKILL.md"];
const VERSION = "1.0.0";

const created: string[] = [];

function project(files: Record<string, string> = {}): string {
  const root = makeWorkspace(files);
  created.push(root);
  return root;
}

function emptyHome(): string {
  return project();
}

/** A skill directory of somebody else: the name is outside the `lexforge` family. */
function writeForeignSkill(skillsDir: string): string {
  const file = path.join(skillsDir, "someone-elses-skill", "SKILL.md");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, "---\nname: someone-elses-skill\n---\n\nNot ours.\n", "utf8");
  return file;
}

/**
 * Lays out a skill install for `tool`, as `planSkillInstall` would leave it.
 * `target` is the project root for the project scope and the home directory
 * for the user scope.
 */
function installSkills(
  target: string,
  tool: string,
  options: {
    overrides?: Record<string, string>;
    version?: string;
    files?: string[];
    scope?: InstallScope;
  } = {},
): string {
  const scope = options.scope ?? "project";
  const skillsDir =
    scope === "project"
      ? path.resolve(target, toolDirectory(tool, "project"))
      : toolDirectory(tool, "user", target);

  for (const name of SHIPPED_FILES) {
    const content = readFileSync(path.join(SKILLS_DIR, name), "utf8");
    const target = path.join(skillsDir, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, options.overrides?.[name] ?? content, "utf8");
  }

  writeFileSync(
    manifestPath(skillsDir),
    renderManifest({
      version: options.version ?? VERSION,
      installedAt: "2026-08-29T10:00:00.000Z",
      tool,
      scope,
      files: options.files ?? SHIPPED_FILES,
    }),
    "utf8",
  );

  return skillsDir;
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

describe("checkSkills", () => {
  it("на файле, отличающемся от поставляемого одной строкой, даёт находку с путём и командой переустановки", () => {
    const root = project();
    const home = emptyHome();
    const shipped = readFileSync(path.join(SKILLS_DIR, "sample-plan/SKILL.md"), "utf8");
    installSkills(root, "claude", {
      overrides: { "sample-plan/SKILL.md": shipped.replace("A sample skill.", "A hand-edited skill.") },
    });

    const result = checkSkills({ root, home, skillsDir: SKILLS_DIR, version: VERSION });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.rule).toBe("skills-modified");
    expect(result.findings[0]!.path).toContain(answerPath(path.join("sample-plan", "SKILL.md")));
    expect(result.findings[0]!.message).toContain("lexforge init --tools claude");
  });

  it("на манифесте прошлой версии даёт находку с обеими версиями", () => {
    const root = project();
    const home = emptyHome();
    installSkills(root, "claude", { version: "0.9.0" });

    const result = checkSkills({ root, home, skillsDir: SKILLS_DIR, version: VERSION });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain("0.9.0");
    expect(result.findings[0]!.message).toContain(VERSION);
  });

  it("когда ни одного каталога скиллов из реестра нет, находка называет команду установки со списком инструментов", () => {
    const root = project();
    const home = emptyHome();

    const result = checkSkills({ root, home, skillsDir: SKILLS_DIR, version: VERSION });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.rule).toBe("skills-not-installed");
    expect(result.findings[0]!.message).toContain("lexforge init --tools");
    for (const tool of ["agents", "claude", "codex", "cursor", "opencode"]) {
      expect(result.findings[0]!.message).toContain(tool);
    }
  });

  it("на манифесте, называющем пропавший файл, находка называет путь", () => {
    const root = project();
    const home = emptyHome();
    const skillsDir = installSkills(root, "claude");
    rmSync(path.join(skillsDir, "sample-verify/SKILL.md"));

    const result = checkSkills({ root, home, skillsDir: SKILLS_DIR, version: VERSION });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.rule).toBe("skills-file-missing");
    expect(result.findings[0]!.path).toContain(answerPath(path.join("sample-verify", "SKILL.md")));
  });

  it("сверяет файлы побайтно: невалидный UTF-8, совпадающий после декодирования, всё равно даёт находку", () => {
    const shippedSource = project();
    const root = project();
    const home = emptyHome();
    const relFile = "sample-plan/SKILL.md";

    // Два разных набора байт, которые Node декодирует в одну и ту же строку
    // с символом замены: побайтная сверка обязана их различить, а сверка
    // декодированных строк — нет.
    const shippedFile = path.join(shippedSource, relFile);
    mkdirSync(path.dirname(shippedFile), { recursive: true });
    writeFileSync(shippedFile, Buffer.from([0x80]));

    const skillsDir = path.resolve(root, toolDirectory("claude", "project"));
    const installedFile = path.join(skillsDir, relFile);
    mkdirSync(path.dirname(installedFile), { recursive: true });
    writeFileSync(installedFile, Buffer.from([0x81]));

    writeFileSync(
      manifestPath(skillsDir),
      renderManifest({
        version: VERSION,
        installedAt: "2026-08-29T10:00:00.000Z",
        tool: "claude",
        scope: "project",
        files: [relFile],
      }),
      "utf8",
    );

    const result = checkSkills({ root, home, skillsDir: shippedSource, version: VERSION });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.rule).toBe("skills-modified");
  });

  it("чужой каталог скиллов в домашнем каталоге находки не даёт при целой проектной установке", () => {
    const root = project();
    const home = emptyHome();
    installSkills(root, "claude");
    writeForeignSkill(path.join(home, ".claude", "skills"));

    const result = checkSkills({ root, home, skillsDir: SKILLS_DIR, version: VERSION });

    expect(result.findings).toEqual([]);
  });

  it("каталог с одними чужими скиллами установкой не считается: находка называет, что скиллы не ставились", () => {
    const root = project();
    const home = emptyHome();
    writeForeignSkill(path.join(home, ".claude", "skills"));

    const result = checkSkills({ root, home, skillsDir: SKILLS_DIR, version: VERSION });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.rule).toBe("skills-not-installed");
  });

  it("на целой установке в пользовательской области ничего не даёт", () => {
    const root = project();
    const home = emptyHome();
    installSkills(home, "claude", { scope: "user" });

    const result = checkSkills({ root, home, skillsDir: SKILLS_DIR, version: VERSION });

    expect(result.findings).toEqual([]);
  });

  it("на расхождении в пользовательской области находка зовёт команду с флагом области", () => {
    const root = project();
    const home = emptyHome();
    const shipped = readFileSync(path.join(SKILLS_DIR, "sample-plan/SKILL.md"), "utf8");
    installSkills(home, "claude", {
      scope: "user",
      overrides: {
        "sample-plan/SKILL.md": shipped.replace("A sample skill.", "A hand-edited skill."),
      },
    });

    const result = checkSkills({ root, home, skillsDir: SKILLS_DIR, version: VERSION });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.rule).toBe("skills-modified");
    expect(result.findings[0]!.message).toContain("lexforge init --tools claude --scope user");
  });

  it("на манифесте прошлой версии в пользовательской области находка зовёт команду с флагом области", () => {
    const root = project();
    const home = emptyHome();
    installSkills(home, "claude", { scope: "user", version: "0.9.0" });

    const result = checkSkills({ root, home, skillsDir: SKILLS_DIR, version: VERSION });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.rule).toBe("skills-version-mismatch");
    expect(result.findings[0]!.message).toContain("lexforge init --tools claude --scope user");
  });

  it("каталог со скиллом семейства lexforge без манифеста даёт находку с командой той же области", () => {
    const root = project();
    const home = emptyHome();
    // Так выглядит установка версии, которая манифеста не писала: каталог
    // скилла имени семейства есть, а файла, называющего его содержимое, нет.
    const left = path.join(toolDirectory("claude", "user", home), "lexforge-plan", "SKILL.md");
    mkdirSync(path.dirname(left), { recursive: true });
    writeFileSync(left, "---\nname: lexforge-plan\n---\n\nLeft behind.\n", "utf8");

    const result = checkSkills({ root, home, skillsDir: SKILLS_DIR, version: VERSION });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.rule).toBe("skills-unmanaged");
    expect(result.findings[0]!.message).toContain("lexforge init --tools claude --scope user");
  });
});
