import { afterEach, describe, expect, it } from "vitest";

import {
  createGitWorkspace,
  writeAt,
  type GitWorkspace,
} from "../helpers/git-workspace.js";
import { runCli } from "../helpers/run-cli.js";

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

/** Every task closed, the requirement named, the file it names edited. */
const PLAN = [
  "## 1. Вход",
  "",
  "- [x] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
  "      -> auth#Password is stored hashed",
  "",
].join("\n");

const created: GitWorkspace[] = [];

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

function project(): GitWorkspace {
  const made = createGitWorkspace({
    "lexforge/config.yaml": CONFIG,
    [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
    [`lexforge/changes/${CHANGE}/proposal.md`]: "## Why\n\nPasswords are stored in the open.\n",
    [`lexforge/changes/${CHANGE}/specs/auth/spec.md`]: AUTH_SPEC,
    [`lexforge/changes/${CHANGE}/design.md`]: "## Context\n\nOne service, one database.\n",
    [`lexforge/changes/${CHANGE}/tasks.md`]: PLAN,
  });
  created.push(made);
  return made;
}

describe("полный круг штампа", () => {
  it("правка кода после записи делает штамп несвежим, повторная запись — свежим", async () => {
    const root = project().root;

    const recorded = await runCli(["evidence", "record", "--change", CHANGE, "--label", "tests"], {
      cwd: root,
    });
    expect(recorded.code, recorded.stderr).toBe(0);

    writeAt(root, "src/app.ts", 'export function app(): string {\n  return "hashed";\n}\n');

    const stale = await runCli(["check", "evidence", "--change", CHANGE, "--require", "tests"], {
      cwd: root,
    });
    expect(stale.code).toBe(1);
    expect(stale.stderr).toContain("stale-worktree");

    const again = await runCli(["evidence", "record", "--change", CHANGE, "--label", "tests"], {
      cwd: root,
    });
    expect(again.code, again.stderr).toBe(0);

    const fresh = await runCli(["check", "evidence", "--change", CHANGE, "--require", "tests"], {
      cwd: root,
    });
    expect(fresh.code, fresh.stderr).toBe(0);
  });
});

describe("машинный вывод ворот", () => {
  it("verify --json кладёт на стандартный вывод один документ, строки для человека — в stderr", async () => {
    const root = project().root;
    writeAt(root, "src/app.ts", 'export function app(): string {\n  return "hashed";\n}\n');
    await runCli(["evidence", "record", "--change", CHANGE, "--label", "tests"], { cwd: root });

    const result = await runCli(["verify", "--change", CHANGE, "--json"], { cwd: root });
    const data = JSON.parse(result.stdout) as {
      outputVersion: number;
      change: string;
      notChecked: string[];
    };

    expect(result.code, result.stderr).toBe(0);
    expect(data.outputVersion).toBe(1);
    expect(data.change).toBe(CHANGE);
    expect(data.notChecked).toHaveLength(3);
    expect(result.stderr).toContain("design.md");
  });
});
