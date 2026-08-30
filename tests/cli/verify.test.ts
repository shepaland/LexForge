import { afterEach, describe, expect, it } from "vitest";

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
`;

const AUTH_SPEC = `## Purpose

Holds what the sign-in of the product does and what it refuses to do.

## ADDED Requirements

### Requirement: Password is stored hashed

The system SHALL store a password as a hash.

#### Scenario: A password is saved

- **WHEN** a user sets a password
- **THEN** the store holds a hash of it
`;

/** A plan with one open task, so the gate has something to report. */
const OPEN_PLAN = [
  "## 1. Вход",
  "",
  "- [x] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
  "      -> auth#Password is stored hashed",
  "- [ ] 1.2 Написать проверку пароля при входе в `src/app.ts`",
  "",
].join("\n");

/** Every task closed, the requirement named, the file it names edited. */
const CLOSED_PLAN = [
  "## 1. Вход",
  "",
  "- [x] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
  "      -> auth#Password is stored hashed",
  "",
].join("\n");

function changeFiles(tasks: string): Record<string, string> {
  return {
    "lexforge/config.yaml": CONFIG,
    [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
    [`lexforge/changes/${CHANGE}/proposal.md`]: "## Why\n\nPasswords are stored in the open.\n",
    [`lexforge/changes/${CHANGE}/specs/auth/spec.md`]: AUTH_SPEC,
    [`lexforge/changes/${CHANGE}/design.md`]: "## Context\n\nOne service, one database.\n",
    [`lexforge/changes/${CHANGE}/tasks.md`]: tasks,
  };
}

const created: GitWorkspace[] = [];

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

function workspace(tasks: string): GitWorkspace {
  const made = createGitWorkspace(changeFiles(tasks));
  created.push(made);
  return made;
}

async function call(argv: string[], cwd: string) {
  const capture = createCapture();
  const exitCode = await run(argv, { cwd, stdout: capture.stdout, stderr: capture.stderr });
  return { exitCode, capture };
}

interface VerifyDocument {
  outputVersion: number;
  change: string;
  findings: { rule: string }[];
  notChecked: string[];
  summary: { openTasks: number; requirementsWithoutTrace: number; staleLabels: number };
  nextStep: string;
}

/** The work of the change: a line the base commit does not carry. */
function editApp(root: string): void {
  writeAt(root, "src/app.ts", 'export function app(): string {\n  return "hashed";\n}\n');
}

describe("lexforge verify", () => {
  it("находки дают код 1 и один документ JSON на стандартном выводе", async () => {
    const root = workspace(OPEN_PLAN).root;
    editApp(root);

    const { exitCode, capture } = await call(["verify", "--change", CHANGE, "--json"], root);
    const data = JSON.parse(capture.out) as VerifyDocument;

    expect(exitCode).toBe(1);
    expect(data.outputVersion).toBe(1);
    expect(data.change).toBe(CHANGE);
    expect(data.summary.openTasks).toBe(1);
    expect(data.notChecked).toHaveLength(3);
    expect(data.nextStep).toContain(`lexforge verify --change ${CHANGE}`);
  });

  it("чистый change даёт код 0", async () => {
    const root = workspace(CLOSED_PLAN).root;
    editApp(root);
    await call(["evidence", "record", "--change", CHANGE, "--label", "tests"], root);

    const { exitCode, capture } = await call(["verify", "--change", CHANGE, "--json"], root);
    const data = JSON.parse(capture.out) as VerifyDocument;

    expect(exitCode).toBe(0);
    expect(data.findings).toEqual([]);
    expect(data.summary).toEqual({
      openTasks: 0,
      requirementsWithoutTrace: 0,
      staleLabels: 0,
    });
  });

  it("вызов без --change даёт код 2", async () => {
    const { exitCode } = await call(["verify"], workspace(OPEN_PLAN).root);

    expect(exitCode).toBe(2);
  });

  it("неизвестный change даёт код 2 и список активных changes", async () => {
    const { exitCode, capture } = await call(["verify", "--change", "nosuch"], workspace(OPEN_PLAN).root);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain(CHANGE);
  });

  it("неизвестный флаг даёт код 2", async () => {
    const { exitCode } = await call(
      ["verify", "--change", CHANGE, "--allow-open-tasks"],
      workspace(OPEN_PLAN).root,
    );

    expect(exitCode).toBe(2);
  });

  it("каталог без репозитория даёт код 2 и называет git init", async () => {
    const made = createPlainWorkspace(changeFiles(CLOSED_PLAN));
    created.push(made);

    const { exitCode, capture } = await call(["verify", "--change", CHANGE], made.root);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("git init");
  });
});
