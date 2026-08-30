import { afterEach, describe, expect, it } from "vitest";

import { CHECK_PLAN_DESCRIPTION } from "../../src/cli/commands/check.js";
import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const SPEC = `## Purpose

Holds what the sign-in of the product does and what it refuses to do.

## ADDED Requirements

### Requirement: Password is stored hashed

The system SHALL store a password as a hash.

#### Scenario: A password is saved

- **WHEN** a user sets a password
- **THEN** the store holds a hash of it
`;

const CLEAN = [
  "## 1. Вход",
  "",
  "- [ ] 1.1 Написать хранение пароля в виде хеша в `src/auth/store.ts`",
  "      -> auth#Password is stored hashed",
  "",
].join("\n");

const WITH_FINDING = [
  "## 1. Вход",
  "",
  "- [ ] 1.1 Написать хранение пароля в виде хеша и оставить TODO на соль",
  "      -> auth#Password is stored hashed",
  "",
].join("\n");

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

function workspace(tasks: string, files: Record<string, string> = {}): string {
  const root = makeWorkspace({
    "lexforge/config.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-auth/proposal.md": "## Why\n\nPasswords are stored in the open.\n",
    "lexforge/changes/add-auth/specs/auth/spec.md": SPEC,
    "lexforge/changes/add-auth/design.md": "## Context\n\nOne service, one database.\n",
    "lexforge/changes/add-auth/tasks.md": tasks,
    ...files,
  });
  created.push(root);
  return root;
}

async function call(argv: string[], cwd: string) {
  const capture = createCapture();
  const exitCode = await run(argv, { cwd, stdout: capture.stdout, stderr: capture.stderr });
  return { exitCode, capture };
}

describe("lexforge check plan", () => {
  it("на плане с находкой печатает один документ JSON и даёт код 1", async () => {
    const root = workspace(WITH_FINDING);

    const { exitCode, capture } = await call(
      ["check", "plan", "--change", "add-auth", "--json"],
      root,
    );
    const data = JSON.parse(capture.out) as {
      outputVersion: number;
      change: string;
      findings: { rule: string; line: number }[];
      summary: { placeholders: number; coverage: number; identifiers: number };
      nextStep: string;
    };

    expect(exitCode).toBe(1);
    expect(data.outputVersion).toBe(1);
    expect(data.change).toBe("add-auth");
    expect(data.findings).toHaveLength(1);
    expect(data.findings[0]!.rule).toBe("task-placeholder");
    expect(data.summary.placeholders).toBe(1);
    expect(data.nextStep).toContain("lexforge check plan --change add-auth");
  });

  it("на чистом плане даёт код 0", async () => {
    const root = workspace(CLEAN);

    const { exitCode, capture } = await call(
      ["check", "plan", "--change", "add-auth", "--json"],
      root,
    );

    expect(exitCode).toBe(0);
    expect((JSON.parse(capture.out) as { findings: unknown[] }).findings).toEqual([]);
  });

  it("вызов без --change даёт код 2 и называет обязательный флаг", async () => {
    const root = workspace(CLEAN);

    const { exitCode, capture } = await call(["check", "plan"], root);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("--change");
    expect(capture.out).toBe("");
  });
});

describe("lexforge check plan: неизвестный флаг", () => {
  it("флаг-послабление даёт код 2 и печать поддерживаемых флагов", async () => {
    const root = workspace(CLEAN);

    const { exitCode, capture } = await call(
      ["check", "plan", "--change", "add-auth", "--allow-placeholders"],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("--allow-placeholders");
    expect(capture.err).toContain("--change");
    expect(capture.err).toContain("--json");
    expect(capture.out).toBe("");
  });
});

// The group carries `evidence` as well from the stage that writes it; the list
// is built from the subcommands registered on the group, so it grows with them.
describe("lexforge check без подкоманды", () => {
  it("печатает подкоманды с описаниями и даёт код 2", async () => {
    const root = workspace(CLEAN);

    const { exitCode, capture } = await call(["check"], root);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("plan");
    expect(capture.err).toContain(CHECK_PLAN_DESCRIPTION);
    expect(capture.out).toBe("");
  });

  it("неизвестная подкоманда даёт тот же список и код 2", async () => {
    const root = workspace(CLEAN);

    const { exitCode, capture } = await call(["check", "dump"], root);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("plan");
    expect(capture.err).toContain(CHECK_PLAN_DESCRIPTION);
    expect(capture.out).toBe("");
  });
});

describe("lexforge check plan: проверка не состоялась", () => {
  it("несуществующий change даёт код 2 и печатает список активных changes", async () => {
    const root = workspace(CLEAN);

    const { exitCode, capture } = await call(
      ["check", "plan", "--change", "add-billing"],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("add-billing");
    expect(capture.err).toContain("add-auth");
    expect(capture.out).toBe("");
  });

  it("каталог без рабочего пространства даёт код 2 и называет первый шаг", async () => {
    const root = makeWorkspace({ "src/app.ts": "export const app = 1;\n" });
    created.push(root);

    const { exitCode, capture } = await call(
      ["check", "plan", "--change", "add-auth"],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("lexforge init");
    expect(capture.out).toBe("");
  });
});

describe("lexforge check plan: репозиторий не нужен", () => {
  it("в каталоге без git-репозитория проверка проходит и даёт код 0", async () => {
    const root = workspace(CLEAN);

    const { exitCode, capture } = await call(
      ["check", "plan", "--change", "add-auth", "--json"],
      root,
    );

    expect(exitCode).toBe(0);
    expect(capture.err).not.toContain("git");
    expect((JSON.parse(capture.out) as { findings: unknown[] }).findings).toEqual([]);
  });
});

describe("lexforge check plan на файлах с переводами строк Windows", () => {
  /** The same text, written the way an editor on Windows writes it. */
  function crlf(text: string): string {
    return text.replace(/\r?\n/g, "\r\n");
  }

  it("находит тот же плейсхолдер на той же строке, что и на файлах с переводами Unix", async () => {
    const windows = workspace(crlf(WITH_FINDING), {
      "lexforge/changes/add-auth/specs/auth/spec.md": crlf(SPEC),
    });

    const { exitCode, capture } = await call(
      ["check", "plan", "--change", "add-auth", "--json"],
      windows,
    );
    const data = JSON.parse(capture.out) as {
      findings: { rule: string; line: number }[];
      summary: { placeholders: number };
    };

    expect(exitCode).toBe(1);
    expect(data.findings).toHaveLength(1);
    expect(data.findings[0]!.rule).toBe("task-placeholder");
    expect(data.findings[0]!.line).toBe(3);
    expect(data.summary.placeholders).toBe(1);
  });

  it("на чистом плане с переводами Windows отвечает кодом 0", async () => {
    const windows = workspace(crlf(CLEAN), {
      "lexforge/changes/add-auth/specs/auth/spec.md": crlf(SPEC),
    });

    const { exitCode } = await call(["check", "plan", "--change", "add-auth"], windows);

    expect(exitCode).toBe(0);
  });
});
