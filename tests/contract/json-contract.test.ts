/**
 * Снимок покрывает только `data` — поля машинного вывода, на которые опираются
 * скиллы. Строки человеческого вывода меняются от версии к версии и контрактом
 * не считаются, поэтому в снимок не попадают.
 *
 * Имена полей заданы решением 10 файла `design.md`. Если снимок разошёлся
 * с решением, правится код, а не снимок.
 */
import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
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

describe("контракт машинного вывода", () => {
  it("status по одному change", async () => {
    const answer = await data(["status", "--change", "add-auth"], workspace());

    expect(keys(answer)).toMatchSnapshot("status --change: ключи data");
    expect(firstKeys(answer.artifacts)).toMatchSnapshot("status --change: ключи artifacts");
  });

  it("status по всему рабочему пространству", async () => {
    const answer = await data(["status"], workspace());

    expect(keys(answer)).toMatchSnapshot("status: ключи data");
    expect(firstKeys(answer.changes)).toMatchSnapshot("status: ключи changes");
  });

  it("instructions по одному артефакту", async () => {
    const answer = await data(["instructions", "tasks", "--change", "add-auth"], workspace());

    expect(keys(answer)).toMatchSnapshot("instructions: ключи data");
    expect(keys(answer.artifact)).toMatchSnapshot("instructions: ключи artifact");
    expect(firstKeys(answer.dependencies)).toMatchSnapshot("instructions: ключи dependencies");
  });

  it("validate по одному change", async () => {
    const answer = await data(["validate", "add-auth", "--strict"], workspace());

    expect(keys(answer)).toMatchSnapshot("validate: ключи data");
    expect(keys(answer.summary)).toMatchSnapshot("validate: ключи summary");
    expect(firstKeys(answer.findings)).toMatchSnapshot("validate: ключи findings");
  });

  it("отказ при машинном выводе", async () => {
    const answer = await data(["status", "--change", "nosuch"], workspace());

    expect(keys(answer)).toMatchSnapshot("отказ: ключи data");
    expect(keys(answer.error)).toMatchSnapshot("отказ: ключи error");
  });
});

describe("человеческий вывод опирается на то же поле следующего шага", () => {
  const cases: Array<[string, string[]]> = [
    ["new change", ["new", "change", "add-payments"]],
    ["status", ["status", "--change", "add-auth"]],
    ["instructions", ["instructions", "tasks", "--change", "add-auth"]],
    ["validate", ["validate", "add-auth"]],
  ];

  for (const [name, argv] of cases) {
    it(`${name}: последняя строка совпадает с полем машинного вывода`, async () => {
      const human = await call(argv, workspace());
      const machine = await data(argv, workspace());

      const lines = human.capture.out.trimEnd().split("\n");

      expect(human.exitCode).toBe(0);
      expect(machine.nextStep).not.toBe("");
      expect(lines.at(-1)).toBe(`Next step: ${machine.nextStep as string}`);
    });
  }
});
