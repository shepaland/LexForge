import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { createPlainWorkspace, type GitWorkspace } from "../helpers/git-workspace.js";
import { healthyDoctorEnv, stubOnPath, type DoctorEnv } from "../helpers/doctor-env.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const created: string[] = [];
const repositories: GitWorkspace[] = [];
const envs: DoctorEnv[] = [];

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
  while (repositories.length > 0) {
    repositories.pop()!.remove();
  }
  while (envs.length > 0) {
    envs.pop()!.remove();
  }
});

/** `healthyDoctorEnv`, registered for cleanup on this file's own `afterEach`. */
async function healthyEnv(): Promise<DoctorEnv> {
  const env = await healthyDoctorEnv();
  envs.push(env);
  return env;
}

async function call(argv: string[], env: DoctorEnv) {
  const capture = createCapture();
  const exitCode = await run(argv, {
    cwd: env.cwd,
    home: env.home,
    pathValue: env.pathValue,
    runningFile: env.runningFile,
    stdout: capture.stdout,
    stderr: capture.stderr,
  });
  return { exitCode, capture };
}

interface DoctorDocument {
  outputVersion: number;
  version: string;
  workspaceRoot: string;
  checks: { id: string; title: string; findings: unknown[] }[];
  findings: { rule: string; level: string; message: string; path?: string }[];
  summary: Record<string, number>;
  nextStep: string;
}

describe("lexforge doctor", () => {
  it("на здоровой установке перечисляет шесть условий как пройденные и даёт код 0", async () => {
    const env = await healthyEnv();

    const { exitCode, capture } = await call(["doctor"], env);

    expect(exitCode, capture.err).toBe(0);
    for (const title of [
      "Workspace and configuration",
      "Verification labels",
      "Installed skills",
      "Command name on PATH",
      "Git repository",
      "Node version",
    ]) {
      expect(capture.out).toContain(title);
    }
  });

  it("на пустом разделе verification и без репозитория даёт две находки, четыре пройденных условия и код 1", async () => {
    const workspace = createPlainWorkspace({ "lexforge/config.yaml": "schema: spec-driven\n" });
    created.push(workspace.root);
    const home = makeWorkspace();
    created.push(home);
    const stub = stubOnPath(workspace.root);

    const initCapture = createCapture();
    await run(["init", "--tools", "claude"], {
      cwd: workspace.root,
      home,
      stdout: initCapture.stdout,
      stderr: initCapture.stderr,
    });

    const env: DoctorEnv = { cwd: workspace.root, home, ...stub, remove: () => {} };
    const { exitCode, capture } = await call(["doctor", "--json"], env);
    const data = JSON.parse(capture.out) as DoctorDocument;

    expect(exitCode, capture.err).toBe(1);
    expect(data.findings).toHaveLength(2);
    expect(data.findings.map((finding) => finding.rule).sort()).toEqual(
      ["repository-missing", "verification-empty"].sort(),
    );
    const passed = data.checks.filter((check) => check.findings.length === 0);
    expect(passed).toHaveLength(4);
  });

  it("в каталоге без lexforge/ даёт код 1 и находку с командой инициализации", async () => {
    const root = makeWorkspace();
    created.push(root);
    const home = makeWorkspace();
    created.push(home);
    const stub = stubOnPath(root);

    const { exitCode, capture } = await call(["doctor"], { cwd: root, home, ...stub, remove: () => {} });

    expect(exitCode).toBe(1);
    expect(capture.err).toContain("lexforge init");
  });

  it("с неизвестным флагом даёт код 2 и печатает справку команды", async () => {
    const env = await healthyEnv();

    const { exitCode, capture } = await call(["doctor", "--fix"], env);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("--json");
    expect(capture.out).toBe("");
  });

  it("на сломанной установке не меняет ни один файл на диске", async () => {
    const env = await healthyEnv();
    // Ломаем: правим руками поставленный скилл.
    const installed = path.join(env.cwd, ".claude/skills/lexforge/SKILL.md");
    writeFileSync(installed, `${readFileSync(installed, "utf8")}\nhand-edited\n`, "utf8");

    const before = snapshot(env.cwd);
    const { exitCode, capture } = await call(["doctor", "--json"], env);
    const after = snapshot(env.cwd);

    expect(exitCode, capture.err).toBe(1);
    expect(after).toEqual(before);
  });

  it("не запускает команды меток verification", async () => {
    const root = makeWorkspace({
      "lexforge/config.yaml":
        "schema: spec-driven\nverification:\n" +
        `  tests: node -e "require('fs').writeFileSync('marker.txt', 'x')"\n`,
    });
    created.push(root);
    const home = makeWorkspace();
    created.push(home);
    const stub = stubOnPath(root);

    await call(["doctor"], { cwd: root, home, ...stub, remove: () => {} });

    expect(existsSync(path.join(root, "marker.txt"))).toBe(false);
  });

  it("с --json несёт outputVersion, version, workspaceRoot, checks, findings, summary и nextStep", async () => {
    const workspace = createPlainWorkspace({ "lexforge/config.yaml": "schema: spec-driven\n" });
    created.push(workspace.root);
    const home = makeWorkspace();
    created.push(home);
    const stub = stubOnPath(workspace.root);

    const { capture } = await call(["doctor", "--json"], {
      cwd: workspace.root,
      home,
      ...stub,
      remove: () => {},
    });
    const data = JSON.parse(capture.out) as DoctorDocument;

    expect(data.outputVersion).toBe(1);
    expect(typeof data.version).toBe("string");
    expect(data.workspaceRoot).toBe(workspace.root);
    expect(data.checks.length).toBe(6);
    expect(data.summary).toBeTruthy();
    expect(typeof data.nextStep).toBe("string");
    expect(data.findings.length).toBeGreaterThan(0);
    for (const finding of data.findings) {
      expect(finding.rule).toBeTruthy();
      expect(finding.level).toBe("error");
      expect(finding.message).toBeTruthy();
    }
  });

  it("поле version совпадает с выводом lexforge --version", async () => {
    const env = await healthyEnv();

    const versionCapture = createCapture();
    await run(["--version"], {
      cwd: env.cwd,
      home: env.home,
      stdout: versionCapture.stdout,
      stderr: versionCapture.stderr,
    });

    const { capture } = await call(["doctor", "--json"], env);
    const data = JSON.parse(capture.out) as DoctorDocument;

    expect(data.version).toBe(versionCapture.out.trim());
  });

  it("вызов из подкаталога с битым config.yaml называет корень проекта, а не подкаталог", async () => {
    // Воспроизводит поломку, найденную ревью: `readProjectConfig` бросает
    // исключение после того, как `findWorkspaceRoot` уже нашёл верный корень,
    // и общий `catch` не должен откатывать уже найденный корень к `cwd`.
    const root = makeWorkspace({
      "lexforge/config.yaml": "schema: [unterminated\n",
      "src/nested/.keep": "",
    });
    created.push(root);
    const home = makeWorkspace();
    created.push(home);
    const stub = stubOnPath(root);
    const subdirectory = path.join(root, "src", "nested");

    const { capture } = await call(["doctor", "--json"], {
      cwd: subdirectory,
      home,
      ...stub,
      remove: () => {},
    });
    const data = JSON.parse(capture.out) as DoctorDocument;

    expect(data.workspaceRoot).toBe(root);
  });
});

/** Every file under `root`, by its content, so a run can be checked for silence. */
function snapshot(root: string): Record<string, string> {
  const map: Record<string, string> = {};

  for (const rel of readdirSync(root, { recursive: true }) as string[]) {
    const full = path.join(root, rel);
    if (statSync(full).isFile()) {
      map[rel] = readFileSync(full).toString("hex");
    }
  }

  return map;
}
