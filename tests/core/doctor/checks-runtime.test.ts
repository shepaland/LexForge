import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { answerPath } from "../../../src/core/answer-path.js";
import { resolveOnPath } from "../../../src/core/command-on-path.js";
import {
  checkPath,
  checkRepository,
  checkRuntime,
} from "../../../src/core/doctor/checks-runtime.js";
import { createGitWorkspace, createPlainWorkspace, git } from "../../helpers/git-workspace.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const created: string[] = [];

function project(files: Record<string, string> = {}): string {
  const root = makeWorkspace(files);
  created.push(root);
  return root;
}

/** A `lexforge` stub with the execute bit set: what a real installation leaves on `PATH`. */
function writeExecutable(file: string): string {
  writeFileSync(file, "#!/usr/bin/env node\n", { encoding: "utf8", mode: 0o755 });
  return file;
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
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
/** Система, где команду на PATH задаёт расширение, а не бит запуска. */
const WINDOWS_ENV = { platform: "win32", pathExt: ".COM;.EXE;.BAT;.CMD" } as const;

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
    expect(result.findings[0]!.message).toContain(answerPath(resolved));
    expect(result.findings[0]!.message).toContain(answerPath(running));
  });

  it("на Windows обёртка рядом с установкой второй установкой не считается", () => {
    const binDir = project();
    writeFileSync(path.join(binDir, "lexforge.cmd"), "@echo off\n", "utf8");
    const running = path.join(binDir, "node_modules", "lexforge", "bin", "lexforge.js");

    const result = checkPath({ pathValue: binDir, runningFile: running, ...WINDOWS_ENV });

    expect(result.findings).toEqual([]);
  });

  it("на Windows обёртка из node_modules/.bin второй установкой не считается", () => {
    const root = project();
    const binDir = path.join(root, "node_modules", ".bin");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(path.join(binDir, "lexforge.cmd"), "@echo off\n", "utf8");
    const running = path.join(root, "node_modules", "lexforge", "bin", "lexforge.js");

    const result = checkPath({ pathValue: binDir, runningFile: running, ...WINDOWS_ENV });

    expect(result.findings).toEqual([]);
  });

  it("на Windows обёртка из чужого дерева даёт path-multiple-installs", () => {
    const binDir = project();
    const wrapper = path.join(binDir, "lexforge.cmd");
    writeFileSync(wrapper, "@echo off\n", "utf8");
    const running = path.join(project(), "node_modules", "lexforge", "bin", "lexforge.js");

    const result = checkPath({ pathValue: binDir, runningFile: running, ...WINDOWS_ENV });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.rule).toBe("path-multiple-installs");
    expect(result.findings[0]!.message).toContain(answerPath(wrapper));
  });

  it("когда разрешённый путь совпадает с запущенным файлом, ничего не даёт", () => {
    const binDir = project();
    const resolved = path.join(binDir, "lexforge");
    writeExecutable(resolved);

    const result = checkPath({ pathValue: binDir, runningFile: resolved, ...POSIX });

    expect(result.findings).toEqual([]);
  });
});
