/**
 * Снимок покрывает только `data` — поля машинного вывода, на которые опираются
 * скиллы. Строки человеческого вывода меняются от версии к версии и контрактом
 * не считаются, поэтому в снимок не попадают.
 *
 * Имена полей заданы решением 10 файла `design.md` этапа 1 и решением 13 того же
 * файла в `lexforge-gate-commands` — для четырёх команд-ворот. Если снимок разошёлся
 * с решением, правится код, а не снимок.
 */
import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { createGitWorkspace, type GitWorkspace } from "../helpers/git-workspace.js";
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

/** Two checks: one that passes, one that fails, so both stamps can be taken. */
const GATE_CONFIG = `schema: spec-driven
verification:
  tests: node -e "process.exit(0)"
  red: node -e "process.exit(1)"
`;

/** A plan the gates have something to say about: one open task, one placeholder. */
const GATE_PLAN = [
  "## 1. Вход",
  "",
  "- [x] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
  "      -> auth#Change carries a delta spec",
  "- [ ] 1.2 TODO",
  "",
].join("\n");

const repositories: GitWorkspace[] = [];

afterEach(() => {
  while (repositories.length > 0) {
    repositories.pop()!.remove();
  }
});

/** A project inside a repository: what the four gates need to run at all. */
function gateProject(): string {
  const made = createGitWorkspace({
    "lexforge/config.yaml": GATE_CONFIG,
    "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-auth/proposal.md": "## Why\n\nPasswords are stored in the open.\n",
    "lexforge/changes/add-auth/specs/auth/spec.md": VALID_SPEC,
    "lexforge/changes/add-auth/design.md": "## Context\n\nOne service, one database.\n",
    "lexforge/changes/add-auth/tasks.md": GATE_PLAN,
  });
  repositories.push(made);
  return made.root;
}

/** The four gates, each called so that it reports at least one finding. */
const GATES: Array<[string, string[], string]> = [
  ["check plan", ["check", "plan", "--change", "add-auth"], "lexforge check plan --change add-auth"],
  [
    "evidence record",
    ["evidence", "record", "--change", "add-auth", "--label", "red"],
    "lexforge evidence record --change add-auth --label red",
  ],
  [
    "check evidence",
    ["check", "evidence", "--change", "add-auth", "--require", "tests"],
    "lexforge check evidence --change add-auth",
  ],
  ["verify", ["verify", "--change", "add-auth"], "lexforge verify --change add-auth"],
];

describe("следующий шаг ворот при находках", () => {
  for (const [name, argv, gate] of GATES) {
    it(`${name}: следующий шаг зовёт те же ворота повторно`, async () => {
      const root = gateProject();
      const { exitCode, capture } = await call([...argv, "--json"], root);
      const answer = JSON.parse(capture.out) as { nextStep: string };

      expect(exitCode, capture.err).toBe(1);
      expect(answer.nextStep).toContain(`then run: ${gate}`);
    });
  }
});

describe("контракт машинного вывода ворот", () => {
  it("check plan", async () => {
    const answer = await data(["check", "plan", "--change", "add-auth"], gateProject());

    expect(keys(answer)).toMatchSnapshot("check plan: ключи data");
    expect(keys(answer.summary)).toMatchSnapshot("check plan: ключи summary");
    expect(firstKeys(answer.findings)).toMatchSnapshot("check plan: ключи findings");
  });

  it("evidence record", async () => {
    const answer = await data(
      ["evidence", "record", "--change", "add-auth", "--label", "red"],
      gateProject(),
    );

    expect(keys(answer)).toMatchSnapshot("evidence record: ключи data");
    expect(keys(answer.summary)).toMatchSnapshot("evidence record: ключи summary");
    expect(keys(answer.record)).toMatchSnapshot("evidence record: ключи record");
    expect(firstKeys(answer.findings)).toMatchSnapshot("evidence record: ключи findings");
  });

  it("check evidence", async () => {
    const answer = await data(["check", "evidence", "--change", "add-auth"], gateProject());

    expect(keys(answer)).toMatchSnapshot("check evidence: ключи data");
    expect(keys(answer.summary)).toMatchSnapshot("check evidence: ключи summary");
    expect(firstKeys(answer.labels)).toMatchSnapshot("check evidence: ключи labels");
    expect(firstKeys(answer.findings)).toMatchSnapshot("check evidence: ключи findings");
  });

  it("verify", async () => {
    const answer = await data(["verify", "--change", "add-auth"], gateProject());

    expect(keys(answer)).toMatchSnapshot("verify: ключи data");
    expect(keys(answer.summary)).toMatchSnapshot("verify: ключи summary");
    expect(firstKeys(answer.findings)).toMatchSnapshot("verify: ключи findings");
  });
});
