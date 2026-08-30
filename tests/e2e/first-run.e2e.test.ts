import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, describe, expect, inject, it } from "vitest";

import { git } from "../helpers/git-workspace.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

/** The nine skills the package installs: five planning, four implementation. */
const SKILL_NAMES = [
  "lexforge",
  "lexforge-apply",
  "lexforge-archive",
  "lexforge-debug",
  "lexforge-design",
  "lexforge-plan",
  "lexforge-propose",
  "lexforge-spec",
  "lexforge-verify",
];

const created: string[] = [];
/** Собран один раз на весь прогон: см. `tests/e2e/pack-tarball.ts`. */
const tarball = inject("tarball");

function tempDir(): string {
  const dir = makeWorkspace();
  created.push(dir);
  return dir;
}

afterAll(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

interface Project {
  root: string;
  /**
   * A throwaway `HOME`: `doctor` and tool detection read the real user-scope
   * skill directories otherwise, and a developer machine running this suite
   * almost certainly has its own `~/.claude/skills` already on it.
   */
  home: string;
}

function installTarball(root: string): void {
  const install = spawnSync(
    "npm",
    ["install", tarball, "--no-audit", "--no-fund", "--loglevel", "error"],
    { cwd: root, encoding: "utf8" },
  );
  expect(install.status, install.stderr).toBe(0);
}

/** A fresh directory with the tarball installed into it, nothing else. */
function installProject(): Project {
  const root = tempDir();
  installTarball(root);
  return { root, home: tempDir() };
}

/** Runs the installed CLI the way a project would: through `npx`, by its bare name. */
function lexforge(argv: string[], project: Project) {
  return spawnSync("npx", ["lexforge", ...argv], {
    cwd: project.root,
    encoding: "utf8",
    env: { ...process.env, HOME: project.home, USERPROFILE: project.home },
  });
}

describe("установка в чистый каталог", () => {
  it(
    "init --tools claude заводит рабочее пространство и девять скиллов",
    () => {
      const project = installProject();

      const result = lexforge(["init", "--tools", "claude"], project);

      expect(result.status, result.stderr).toBe(0);
      expect(existsSync(path.join(project.root, "lexforge/config.yaml"))).toBe(true);
      expect(existsSync(path.join(project.root, "lexforge/specs"))).toBe(true);
      expect(existsSync(path.join(project.root, "lexforge/changes/archive"))).toBe(true);
      expect(readdirSync(path.join(project.root, ".claude/skills")).sort()).toEqual(SKILL_NAMES);
    },
    300_000,
  );

  it(
    "называет следующим шагом lexforge doctor",
    () => {
      const project = installProject();

      const result = lexforge(["init", "--tools", "claude"], project);
      const lines = result.stdout.trimEnd().split("\n");

      expect(result.status, result.stderr).toBe(0);
      expect(lines.at(-1)).toBe("Next step: lexforge doctor");
    },
    300_000,
  );
});

describe("круг из четырёх вызовов", () => {
  it(
    "init, doctor, new change и status --json завершаются кодом 0",
    () => {
      const root = tempDir();
      // `doctor` needs a repository with a commit and at least one
      // verification label; both are set up here, not by any of the four
      // calls under test — the same way a person sets a project up once,
      // before the pipeline is asked to check itself.
      git(root, "init", "--initial-branch=main", "--quiet");
      git(root, "commit", "--allow-empty", "--message", "start", "--quiet");
      installTarball(root);
      const project: Project = { root, home: tempDir() };

      const init = lexforge(["init", "--tools", "claude"], project);
      expect(init.status, init.stderr).toBe(0);

      const configPath = path.join(root, "lexforge/config.yaml");
      writeFileSync(
        configPath,
        `${readFileSync(configPath, "utf8")}verification:\n  tests: npm test\n`,
        "utf8",
      );

      const doctor = lexforge(["doctor"], project);
      expect(doctor.status, doctor.stderr).toBe(0);

      const change = lexforge(["new", "change", "smoke"], project);
      expect(change.status, change.stderr).toBe(0);

      const status = lexforge(["status", "--change", "smoke", "--json"], project);
      expect(status.status, status.stderr).toBe(0);

      const data = JSON.parse(status.stdout) as { outputVersion: number; change: string };
      expect(data.outputVersion).toBe(1);
      expect(data.change).toBe("smoke");
    },
    300_000,
  );
});

describe("проверка сразу после установки", () => {
  it(
    "doctor даёт код 1 и называет отсутствие репозитория и пустой verification",
    () => {
      const project = installProject();

      const init = lexforge(["init", "--tools", "claude"], project);
      expect(init.status, init.stderr).toBe(0);

      const doctor = lexforge(["doctor", "--json"], project);
      const data = JSON.parse(doctor.stdout) as {
        findings: Array<{ rule: string }>;
      };
      const rules = data.findings.map((finding) => finding.rule);

      expect(doctor.status).toBe(1);
      expect(rules).toContain("repository-missing");
      expect(rules).toContain("verification-empty");
    },
    300_000,
  );
});

describe("пакет потерял шаблон", () => {
  it(
    "new change падает на вызове, которому нужен пропавший шаблон",
    () => {
      const project = installProject();

      const init = lexforge(["init", "--tools", "claude"], project);
      expect(init.status, init.stderr).toBe(0);

      const templatePath = path.join(
        project.root,
        "node_modules",
        "lexforge",
        "schemas",
        "spec-driven",
        "templates",
        "proposal.md",
      );
      expect(existsSync(templatePath)).toBe(true);
      rmSync(templatePath);

      const change = lexforge(["new", "change", "smoke"], project);

      expect(change.status).not.toBe(0);
      expect(change.stderr).toContain("template");
    },
    300_000,
  );
});

describe("вторая установка", () => {
  it(
    "убирает скилл, который называет манифест прошлой версии, и оставляет девять текущих",
    () => {
      const project = installProject();

      // A skill left by a version that carried it, and its manifest — the
      // shape `renderManifest` writes, but a version this package no longer
      // ships. Nothing here comes from an actual old release: it stands in
      // for one.
      const skillsDir = path.join(project.root, ".claude", "skills");
      const retiredSkill = path.join(skillsDir, "lexforge-retired", "SKILL.md");
      mkdirSync(path.dirname(retiredSkill), { recursive: true });
      writeFileSync(retiredSkill, "a skill this version dropped\n", "utf8");
      writeFileSync(
        path.join(project.root, ".claude", "lexforge-install.json"),
        JSON.stringify(
          {
            version: "0.9.0",
            installedAt: "2026-08-01T00:00:00.000Z",
            tool: "claude",
            scope: "project",
            files: ["lexforge-retired/SKILL.md"],
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = lexforge(["init", "--tools", "claude"], project);

      expect(result.status, result.stderr).toBe(0);
      expect(existsSync(path.join(skillsDir, "lexforge-retired"))).toBe(false);
      expect(readdirSync(skillsDir).sort()).toEqual(SKILL_NAMES);
    },
    300_000,
  );
});
