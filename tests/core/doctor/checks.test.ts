import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { manifestPath, renderManifest } from "../../../src/core/init/install-manifest.js";
import type { InstallScope } from "../../../src/core/init/tool-registry.js";
import { toolDirectory } from "../../../src/core/init/tool-registry.js";
import {
  checkPath,
  checkRepository,
  checkRuntime,
  checkSkills,
  checkVerification,
  checkWorkspace,
  resolveOnPath,
} from "../../../src/core/doctor/checks.js";
import { createGitWorkspace, createPlainWorkspace, git } from "../../helpers/git-workspace.js";
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

/** A `lexforge` stub with the execute bit set: what a real installation leaves on `PATH`. */
function writeExecutable(file: string): string {
  writeFileSync(file, "#!/usr/bin/env node\n", { encoding: "utf8", mode: 0o755 });
  return file;
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

describe("checkWorkspace", () => {
  it("на каталоге без lexforge/ даёт находку с командой lexforge init", () => {
    const root = project();

    const result = checkWorkspace(root);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain("lexforge init");
  });

  it("на заведённом рабочем пространстве не даёт ничего", () => {
    const root = project({ "lexforge/config.yaml": "schema: spec-driven\n" });

    const result = checkWorkspace(root);

    expect(result.findings).toEqual([]);
  });

  it("на синтаксически битом config.yaml даёт находку вместо исключения", () => {
    const root = project({ "lexforge/config.yaml": "schema: [unterminated\n" });

    const result = checkWorkspace(root);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.rule).toBeTruthy();
    expect(result.findings[0]!.path).toBe(path.join(root, "lexforge/config.yaml"));
  });

  it("на каталоге lexforge/ без config.yaml находка называет путь известного файла", () => {
    const root = project({ "lexforge/": "" });

    const result = checkWorkspace(root);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.rule).toBe("workspace-incomplete");
    expect(result.findings[0]!.path).toBe(path.join(root, "lexforge/config.yaml"));
  });
});

describe("checkVerification", () => {
  it("на пустом разделе verification даёт находку с примером двух меток", () => {
    const result = checkVerification({});

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain("tests");
    expect(result.findings[0]!.message).toContain("lint");
  });

  it("на непустом разделе verification не даёт ничего", () => {
    const result = checkVerification({ tests: "npm test" });

    expect(result.findings).toEqual([]);
  });
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
    expect(result.findings[0]!.path).toContain(path.join("sample-plan", "SKILL.md"));
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
    expect(result.findings[0]!.path).toContain(path.join("sample-verify", "SKILL.md"));
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

describe("checkRepository", () => {
  it("на каталоге без .git даёт находку", () => {
    const workspace = createPlainWorkspace();
    created.push(workspace.root);

    const result = checkRepository(workspace.root);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.rule).toBe("repository-missing");
  });

  it("на репозитории без коммита даёт находку", () => {
    const root = project();
    git(root, "init", "--initial-branch=main");

    const result = checkRepository(root);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.rule).toBe("repository-no-commit");
  });

  it("на репозитории с коммитом не даёт ничего", () => {
    const workspace = createGitWorkspace();
    created.push(workspace.root);

    const result = checkRepository(workspace.root);

    expect(result.findings).toEqual([]);
  });
});

/** Право на запуск задают только Linux и macOS: на Windows его нет вовсе. */
const POSIX = { platform: "linux" } as const;
/** Прогон на Windows не отличает файл с битом запуска от файла без него. */
const onPosix = it.skipIf(process.platform === "win32");

describe("resolveOnPath на Linux и macOS", () => {
  it("находит файл в первом каталоге списка", () => {
    const first = project();
    const second = project();
    writeExecutable(path.join(first, "lexforge"));
    writeExecutable(path.join(second, "lexforge"));
    const pathValue = [first, second].join(path.delimiter);

    expect(resolveOnPath("lexforge", pathValue, POSIX)).toBe(path.join(first, "lexforge"));
  });

  it("отдаёт пустой результат, когда имени нет ни в одном каталоге", () => {
    const only = project();
    const pathValue = [only].join(path.delimiter);

    expect(resolveOnPath("lexforge", pathValue, POSIX)).toBeUndefined();
  });

  onPosix("файл без бита запуска именем команды не считается", () => {
    const only = project();
    writeFileSync(path.join(only, "lexforge"), "#!/usr/bin/env node\n", {
      encoding: "utf8",
      mode: 0o644,
    });

    expect(resolveOnPath("lexforge", only, POSIX)).toBeUndefined();
  });

  onPosix("пропускает неисполняемый файл и находит исполняемый в следующем каталоге", () => {
    const first = project();
    const second = project();
    writeFileSync(path.join(first, "lexforge"), "#!/usr/bin/env node\n", {
      encoding: "utf8",
      mode: 0o644,
    });
    const executable = writeExecutable(path.join(second, "lexforge"));

    expect(resolveOnPath("lexforge", [first, second].join(path.delimiter), POSIX)).toBe(executable);
  });

  it("каталог с именем команды именем команды не считается", () => {
    const only = project();
    mkdirSync(path.join(only, "lexforge"));

    expect(resolveOnPath("lexforge", only, POSIX)).toBeUndefined();
  });
});

describe("resolveOnPath на Windows", () => {
  const WINDOWS = { platform: "win32", pathExt: ".COM;.EXE;.BAT;.CMD" } as const;

  /** Что оставляет на PATH установка пакета: файл с расширением из PATHEXT. */
  function writeCommand(directory: string, file: string): string {
    const target = path.join(directory, file);
    writeFileSync(target, "@echo off\n", { encoding: "utf8", mode: 0o644 });
    return target;
  }

  it("находит команду по расширению из PATHEXT и не требует бита запуска", () => {
    const only = project();
    const command = writeCommand(only, "lexforge.cmd");

    expect(resolveOnPath("lexforge", only, WINDOWS)).toBe(command);
  });

  it("при пустом PATHEXT берёт список по умолчанию", () => {
    const only = project();
    const command = writeCommand(only, "lexforge.cmd");

    expect(resolveOnPath("lexforge", only, { platform: "win32", pathExt: "" })).toBe(command);
  });

  it("идёт по расширениям в порядке PATHEXT", () => {
    const only = project();
    const exe = writeCommand(only, "lexforge.exe");
    writeCommand(only, "lexforge.cmd");

    expect(resolveOnPath("lexforge", only, WINDOWS)).toBe(exe);
  });

  it("отдаёт пустой результат, когда ни одно расширение не совпало", () => {
    const only = project();
    writeCommand(only, "lexforge.ps1");

    expect(resolveOnPath("lexforge", only, WINDOWS)).toBeUndefined();
  });

  it("каталог с именем команды и расширением командой не считается", () => {
    const only = project();
    mkdirSync(path.join(only, "lexforge.cmd"));

    expect(resolveOnPath("lexforge", only, WINDOWS)).toBeUndefined();
  });
});

describe("checkRuntime", () => {
  it("на версии ниже engines даёт находку", () => {
    const result = checkRuntime({ current: "18.19.0", required: ">=20.19.0" });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain("20.19.0");
    expect(result.findings[0]!.message).toContain("18.19.0");
  });

  it("на подходящей версии не даёт ничего", () => {
    const result = checkRuntime({ current: "20.19.0", required: ">=20.19.0" });

    expect(result.findings).toEqual([]);
  });
});

describe("checkPath", () => {
  it("когда имя не резолвится, находка называет обе законные установки", () => {
    const only = project();
    const running = path.join(only, "node_modules", ".bin", "lexforge");

    const result = checkPath({ pathValue: only, runningFile: running, ...POSIX });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain("npm install -g");
    expect(result.findings[0]!.message).toContain("npx");
  });

  it("когда разрешённый путь отличается от запущенного файла, находка называет оба пути", () => {
    const binDir = project();
    const resolved = path.join(binDir, "lexforge");
    writeExecutable(resolved);
    const running = path.join(project(), "node_modules", ".bin", "lexforge");

    const result = checkPath({ pathValue: binDir, runningFile: running, ...POSIX });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain(resolved);
    expect(result.findings[0]!.message).toContain(running);
  });

  it("когда разрешённый путь совпадает с запущенным файлом, ничего не даёт", () => {
    const binDir = project();
    const resolved = path.join(binDir, "lexforge");
    writeExecutable(resolved);

    const result = checkPath({ pathValue: binDir, runningFile: resolved, ...POSIX });

    expect(result.findings).toEqual([]);
  });
});
