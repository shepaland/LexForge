import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { healthyDoctorEnv, stubOnPath, type DoctorEnv } from "../helpers/doctor-env.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const created: string[] = [];

const VALID_SPEC = `## Purpose

Reads the delta spec of a change and reports what the scanner finds in it.

## ADDED Requirements

### Requirement: Change carries a delta spec

The system SHALL read the delta spec of the change.

#### Scenario: Delta spec is written

- **WHEN** the change directory holds one spec file
- **THEN** the scanner reports one requirement
`;

function workspace(): string {
  const root = makeWorkspace({
    "lexforge/config.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-auth/proposal.md": "## Why\n\nPasswords are stored in the open.\n",
    "lexforge/changes/add-auth/specs/auth/spec.md": VALID_SPEC,
    "lexforge/changes/add-auth/design.md": "## Context\n\nOne service, one database.\n",
    "lexforge/changes/rename-menu/.lexforge.yaml": "schema: bounded\n",
  });
  created.push(root);
  return root;
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

async function call(argv: string[], cwd: string) {
  const capture = createCapture();
  const exitCode = await run(argv, { cwd, stdout: capture.stdout, stderr: capture.stderr });
  return { exitCode, capture };
}

async function data(argv: string[], cwd: string): Promise<Record<string, unknown>> {
  const { capture } = await call([...argv, "--json"], cwd);
  return JSON.parse(capture.out) as Record<string, unknown>;
}

function keys(value: unknown): string[] {
  return Object.keys(value as Record<string, unknown>).sort();
}

function firstKeys(value: unknown): string[] {
  const list = value as unknown[];
  expect(list.length).toBeGreaterThan(0);
  return keys(list[0]);
}

describe("контракт машинного вывода defect", () => {
  it("defect record", async () => {
    const answer = await data(
      [
        "defect",
        "record",
        "--change",
        "add-auth",
        "--level",
        "minor",
        "--file",
        "src/app.ts",
        "--line",
        "3",
        "--summary",
        "naming is inconsistent with the rest of the module",
      ],
      workspace(),
    );

    expect(keys(answer)).toMatchSnapshot("defect record: ключи data");
    expect(keys(answer.defect)).toMatchSnapshot("defect record: ключи defect");
  });

  it("defect close", async () => {
    const root = workspace();
    const recorded = await data(
      [
        "defect",
        "record",
        "--change",
        "add-auth",
        "--level",
        "minor",
        "--file",
        "src/app.ts",
        "--line",
        "3",
        "--summary",
        "naming is inconsistent with the rest of the module",
      ],
      root,
    );
    const id = (recorded.defect as { id: string }).id;

    const answer = await data(["defect", "close", id], root);

    expect(keys(answer)).toMatchSnapshot("defect close: ключи data");
    expect(keys(answer.defect)).toMatchSnapshot("defect close: ключи defect");
  });

  it("defect list", async () => {
    const root = workspace();
    await call(
      [
        "defect",
        "record",
        "--change",
        "add-auth",
        "--level",
        "minor",
        "--file",
        "src/app.ts",
        "--line",
        "3",
        "--summary",
        "naming is inconsistent with the rest of the module",
      ],
      root,
    );

    const answer = await data(["defect", "list"], root);

    expect(keys(answer)).toMatchSnapshot("defect list: ключи data");
    expect(firstKeys(answer.defects)).toMatchSnapshot("defect list: ключи defects");
  });
});

const doctorEnvs: DoctorEnv[] = [];

afterEach(() => {
  while (doctorEnvs.length > 0) {
    doctorEnvs.pop()!.remove();
  }
});

/** `healthyDoctorEnv`, registered for cleanup on this file's own `afterEach`. */
async function healthyInstall(): Promise<DoctorEnv> {
  const env = await healthyDoctorEnv();
  doctorEnvs.push(env);
  return env;
}

/** One `doctor --json` run against a prepared installation. */
async function doctorData(env: DoctorEnv): Promise<Record<string, unknown>> {
  const capture = createCapture();
  const exitCode = await run(["doctor", "--json"], {
    cwd: env.cwd,
    home: env.home,
    pathValue: env.pathValue,
    runningFile: env.runningFile,
    stdout: capture.stdout,
    stderr: capture.stderr,
  });
  expect(exitCode, capture.err).not.toBe(2);
  return JSON.parse(capture.out) as Record<string, unknown>;
}

describe("контракт машинного вывода проверки установки", () => {
  it("doctor на здоровой установке", async () => {
    const answer = await doctorData(await healthyInstall());

    expect(keys(answer)).toMatchSnapshot("doctor: ключи data");
    expect(keys(answer.summary)).toMatchSnapshot("doctor: ключи summary");
    expect(firstKeys(answer.checks)).toMatchSnapshot("doctor: ключи checks");
    // Имена условий — публичный контракт наравне с именами полей: по ним
    // скилл находит нужное условие в ответе.
    expect(
      (answer.checks as Array<{ id: string; title: string }>).map(
        (check) => `${check.id}: ${check.title}`,
      ),
    ).toMatchSnapshot("doctor: имена и заголовки условий");
  });

  it("doctor с находкой о файле", async () => {
    const env = await healthyInstall();
    const installed = path.join(env.cwd, ".claude/skills/lexforge/SKILL.md");
    writeFileSync(installed, `${readFileSync(installed, "utf8")}\nhand-edited\n`, "utf8");

    const answer = await doctorData(env);

    expect(firstKeys(answer.findings)).toMatchSnapshot("doctor: ключи findings");
  });
});

describe("контракт машинного вывода инициализации", () => {
  it("init со списком инструментов", async () => {
    const root = makeWorkspace();
    created.push(root);
    const home = makeWorkspace();
    created.push(home);
    const capture = createCapture();

    const exitCode = await run(["init", "--tools", "claude", "--json"], {
      cwd: root,
      home,
      stdout: capture.stdout,
      stderr: capture.stderr,
    });
    const answer = JSON.parse(capture.out) as Record<string, unknown>;

    expect(exitCode, capture.err).toBe(0);
    expect(keys(answer)).toMatchSnapshot("init: ключи data");
  });
});

describe("коды возврата команды doctor", () => {
  it("здоровая установка даёт 0", async () => {
    const env = await healthyInstall();
    const capture = createCapture();

    const exitCode = await run(["doctor"], {
      cwd: env.cwd,
      home: env.home,
      pathValue: env.pathValue,
      runningFile: env.runningFile,
      stdout: capture.stdout,
      stderr: capture.stderr,
    });

    expect(exitCode, capture.err).toBe(0);
  });

  it("находка на пустом рабочем пространстве даёт 1", async () => {
    const root = makeWorkspace();
    created.push(root);
    const home = makeWorkspace();
    created.push(home);
    const stub = stubOnPath(root);
    const capture = createCapture();

    const exitCode = await run(["doctor"], {
      cwd: root,
      home,
      pathValue: stub.pathValue,
      runningFile: stub.runningFile,
      stdout: capture.stdout,
      stderr: capture.stderr,
    });

    expect(exitCode).toBe(1);
  });

  it("неизвестный флаг даёт 2", async () => {
    const env = await healthyInstall();
    const capture = createCapture();

    const exitCode = await run(["doctor", "--fix"], {
      cwd: env.cwd,
      home: env.home,
      pathValue: env.pathValue,
      runningFile: env.runningFile,
      stdout: capture.stdout,
      stderr: capture.stderr,
    });

    expect(exitCode).toBe(2);
  });
});
