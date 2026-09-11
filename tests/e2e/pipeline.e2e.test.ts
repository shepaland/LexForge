import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "../helpers/run-cli.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const created: string[] = [];

function tempProject(files: Record<string, string> = {}): string {
  const root = makeWorkspace(files);
  created.push(root);
  return root;
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

function lastLine(text: string): string {
  return text.trimEnd().split("\n").at(-1) ?? "";
}

describe("собранный CLI запускается", () => {
  // A cycle between two modules under `src/` can type-check clean and still
  // crash the moment `node` loads the compiled `dist/` for real: a `const`
  // computed from another module's `const` at the top of a file hits the
  // temporal dead zone if the cycle is entered from the wrong side. `--help`
  // needs no workspace and touches no business logic; it only forces every
  // command module `run.ts` registers to load, so a broken import graph
  // fails here before any of the scenarios below get a chance to run.
  it("--help не падает при загрузке модулей и печатает список команд", async () => {
    const result = await runCli(["--help"], { cwd: tempProject() });

    expect(result.code, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Commands:");
  });
});

describe("сквозной проход по конвейеру", () => {
  it("четыре команды подряд дают код 0 и заканчивают вывод следующим шагом", async () => {
    const root = tempProject();

    const calls = [
      ["init"],
      ["new", "change", "add-auth"],
      ["status", "--change", "add-auth"],
      ["instructions", "proposal", "--change", "add-auth"],
    ];

    for (const argv of calls) {
      const result = await runCli(argv, { cwd: root });

      expect(result.code, `${argv.join(" ")} → ${result.stderr}`).toBe(0);
      expect(lastLine(result.stdout)).toMatch(/^Next step: /);
    }
  });

  it("при машинном выводе на стандартном выводе лежит только JSON", async () => {
    const root = tempProject();

    await runCli(["init"], { cwd: root });
    await runCli(["new", "change", "add-auth"], { cwd: root });

    const result = await runCli(["status", "--change", "add-auth", "--json"], { cwd: root });
    const data = JSON.parse(result.stdout) as { outputVersion: number; change: string };

    expect(result.code).toBe(0);
    expect(data.outputVersion).toBe(1);
    expect(data.change).toBe("add-auth");
    expect(result.stderr).toContain("proposal");
  });
});

const REQUIREMENT_WITHOUT_SCENARIO = `## Purpose

Keeps a requirement that nobody wrote a scenario for.

## ADDED Requirements

### Requirement: Empty requirement
`;

describe("коды возврата процесса", () => {
  it("неизвестная команда даёт код 2", async () => {
    const result = await runCli(["nosuchcmd"], { cwd: tempProject() });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("validate");
  });

  it("находка валидации даёт код 1", async () => {
    const root = tempProject();

    await runCli(["init"], { cwd: root });
    await runCli(["new", "change", "add-auth"], { cwd: root });

    const specDir = path.join(root, "lexforge", "changes", "add-auth", "specs", "auth");
    mkdirSync(specDir, { recursive: true });
    writeFileSync(path.join(specDir, "spec.md"), REQUIREMENT_WITHOUT_SCENARIO, "utf8");

    const result = await runCli(["validate", "add-auth"], { cwd: root });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("requirement-without-scenario");
    expect(result.stdout).toBe("");
  });

  it("вызов вне рабочего пространства даёт код 2", async () => {
    const result = await runCli(["status"], { cwd: tempProject() });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("lexforge init");
  });
});
