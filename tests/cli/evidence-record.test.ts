import { afterEach, describe, expect, it } from "vitest";

import { EVIDENCE_RECORD_DESCRIPTION } from "../../src/cli/commands/evidence.js";
import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import {
  createGitWorkspace,
  createPlainWorkspace,
  writeAt,
  type GitWorkspace,
} from "../helpers/git-workspace.js";

const CHANGE = "add-auth";

const CONFIG = `schema: spec-driven
verification:
  tests: node -e "process.exit(0)"
  lint: node -e "process.exit(1)"
`;

const CHANGE_FILES = {
  [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
  [`lexforge/changes/${CHANGE}/proposal.md`]: "## Why\n\nPasswords are stored in the open.\n",
};

const created: GitWorkspace[] = [];

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

function workspace(config = CONFIG): GitWorkspace {
  const made = createGitWorkspace({ "lexforge/config.yaml": config, ...CHANGE_FILES });
  created.push(made);
  return made;
}

async function call(argv: string[], cwd: string) {
  const capture = createCapture();
  const exitCode = await run(argv, { cwd, stdout: capture.stdout, stderr: capture.stderr });
  return { exitCode, capture };
}

describe("lexforge evidence record", () => {
  it("зелёная команда метки даёт код 0 и печатает один документ JSON", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(
      ["evidence", "record", "--change", CHANGE, "--label", "tests", "--json"],
      root,
    );
    const data = JSON.parse(capture.out) as {
      outputVersion: number;
      change: string;
      label: string;
      record: { command: string; exitCode: number; head: string };
      findings: unknown[];
      nextStep: string;
    };

    expect(exitCode).toBe(0);
    expect(data.outputVersion).toBe(1);
    expect(data.change).toBe(CHANGE);
    expect(data.label).toBe("tests");
    expect(data.record.exitCode).toBe(0);
    expect(data.findings).toEqual([]);
    expect(data.nextStep).toContain("lexforge check evidence --change add-auth");
  });

  it("красная команда метки даёт код 1", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(
      ["evidence", "record", "--change", CHANGE, "--label", "lint", "--json"],
      root,
    );
    const data = JSON.parse(capture.out) as { findings: { rule: string }[] };

    expect(exitCode).toBe(1);
    expect(data.findings).toHaveLength(1);
    expect(data.findings[0]!.rule).toBe("evidence-run-failed");
  });

  it("вызов без --label даёт код 2 и перечисляет описанные метки", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(["evidence", "record", "--change", CHANGE], root);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("tests");
    expect(capture.err).toContain("lint");
    expect(capture.out).toBe("");
  });

  it("лишний позиционный аргумент даёт код 2", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(
      ["evidence", "record", "--change", CHANGE, "--label", "tests", "--", "true"],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.out).toBe("");
  });

  it("флаг с командой не поддерживается и даёт код 2", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(
      ["evidence", "record", "--change", CHANGE, "--label", "tests", "--command", "true"],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("--command");
    expect(capture.out).toBe("");
  });
});

describe("lexforge evidence без подкоманды", () => {
  it("группа без подкоманды печатает список подкоманд и даёт код 2", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(["evidence"], root);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain('"lexforge evidence" needs a subcommand');
    expect(capture.err).toContain("record");
    expect(capture.err).toContain(EVIDENCE_RECORD_DESCRIPTION);
    expect(capture.out).toBe("");
  });

  it("подкоманда dump даёт тот же список и код 2", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(["evidence", "dump"], root);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain('"lexforge evidence" has no subcommand "dump"');
    expect(capture.err).toContain("record");
    expect(capture.err).toContain(EVIDENCE_RECORD_DESCRIPTION);
    expect(capture.out).toBe("");
  });
});

describe("lexforge evidence record: репозитория нет", () => {
  it("каталог без репозитория даёт код 2 и называет первый шаг", async () => {
    const plain = createPlainWorkspace({ "lexforge/config.yaml": CONFIG, ...CHANGE_FILES });
    created.push(plain);

    const { exitCode, capture } = await call(
      ["evidence", "record", "--change", CHANGE, "--label", "tests"],
      plain.root,
    );

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("git init");
    expect(capture.out).toBe("");
  });
});

const AUTH_SPEC = `## Purpose

Holds what the sign-in of the product does and what it refuses to do.

## ADDED Requirements

### Requirement: Password is stored hashed

The system SHALL store a password as a hash.

#### Scenario: A password is saved

- **WHEN** a user sets a password
- **THEN** the store holds a hash of it
`;

/** One ticked task naming production work, linked to the one requirement. */
const CLOSED_PLAN = [
  "## 1. Вход",
  "",
  "- [x] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
  "      -> auth#Password is stored hashed",
  "",
].join("\n");

/** A change whole enough for `verify`: proposal, spec, design, plan. */
function verifiableWorkspace(config = CONFIG): GitWorkspace {
  const made = createGitWorkspace({
    "lexforge/config.yaml": config,
    [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
    [`lexforge/changes/${CHANGE}/proposal.md`]: "## Why\n\nPasswords are stored in the open.\n",
    [`lexforge/changes/${CHANGE}/specs/auth/spec.md`]: AUTH_SPEC,
    [`lexforge/changes/${CHANGE}/design.md`]: "## Context\n\nOne service, one database.\n",
    [`lexforge/changes/${CHANGE}/tasks.md`]: CLOSED_PLAN,
  });
  created.push(made);
  return made;
}

describe("lexforge evidence record: --task не поддерживается", () => {
  it("флаг --task неизвестен для record и даёт код 2", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(
      ["evidence", "record", "--change", CHANGE, "--label", "tests", "--task", "1.1"],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("--task");
    expect(capture.out).toBe("");
  });
});

describe("lexforge evidence record: штамп метки и красная запись задачи не подменяют друг друга", () => {
  it("свежий зелёный штамп метки не закрывает задачу без её красной записи", async () => {
    const root = verifiableWorkspace().root;
    writeAt(root, "src/app.ts", 'export function app(): string {\n  return "hashed";\n}\n');

    const record = await call(
      ["evidence", "record", "--change", CHANGE, "--label", "tests"],
      root,
    );
    expect(record.exitCode).toBe(0);

    const verify = await call(["verify", "--change", CHANGE, "--json"], root);
    const data = JSON.parse(verify.capture.out) as { findings: { rule: string }[] };

    expect(verify.exitCode).toBe(1);
    expect(data.findings.map((finding) => finding.rule)).toContain("task-no-red-record");
  });

  it("красная запись задачи не заменяет отсутствующий штамп метки", async () => {
    const root = verifiableWorkspace().root;
    writeAt(root, "src/app.ts", 'export function app(): string {\n  return "hashed";\n}\n');

    const red = await call(
      [
        "evidence",
        "red",
        "--change",
        CHANGE,
        "--task",
        "1.1",
        "--command",
        'node -e "process.exit(1)"',
      ],
      root,
    );
    expect(red.exitCode).toBe(0);

    const verify = await call(["verify", "--change", CHANGE, "--json"], root);
    const data = JSON.parse(verify.capture.out) as { findings: { rule: string }[] };

    expect(verify.exitCode).toBe(1);
    expect(data.findings.map((finding) => finding.rule)).toContain("evidence-not-fresh");
  });
});
