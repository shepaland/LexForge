/**
 * Сквозной круг архивации: временный репозиторий, две capability, четыре операции
 * дельты. Тексты слитых спек стоят здесь целиком, а не считаются повторным вызовом
 * слияния: тест, сверяющий результат команды с результатом той же функции, проходит
 * и на неверном слиянии.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createGitWorkspace, writeAt, type GitWorkspace } from "../helpers/git-workspace.js";
import { runCli } from "../helpers/run-cli.js";

const CHANGE = "add-auth";

const CONFIG = `schema: spec-driven
verification:
  tests: node -e "process.exit(0)"
`;

const AUTH_PURPOSE = "Holds what the sign-in of the product does and what it refuses to do.";
const BILLING_PURPOSE = "Holds how the shop bills an order and what it refuses to bill.";

/** The requirement MODIFIED replaces, as it stands before the merge. */
const HASHED_BEFORE = `### Requirement: Password is stored hashed

The system SHALL store a password as a hash.

#### Scenario: A password is saved

- **WHEN** a user sets a password
- **THEN** the store holds a hash of it
`;

/** The same requirement as the delta hands it over. */
const HASHED_AFTER = `### Requirement: Password is stored hashed

The system SHALL store a password as an argon2id hash.

#### Scenario: A password is saved

- **WHEN** a user sets a password
- **THEN** the store holds an argon2id hash of it
`;

/** The requirement REMOVED takes away. */
const SESSION = `### Requirement: Session expires

The system SHALL end a session after 30 days.

#### Scenario: An old session is used

- **WHEN** a session older than 30 days is used
- **THEN** the request is refused
`;

/** The body RENAMED carries over under a new heading. */
const THROTTLE_BODY = `
The system SHALL refuse more than ten sign-in attempts an hour.

#### Scenario: The eleventh attempt

- **WHEN** an account takes an eleventh attempt in an hour
- **THEN** the attempt is refused
`;

/** The requirement ADDED brings in. */
const RESET = `### Requirement: Password reset is rate limited

The system SHALL refuse more than three password resets a day.

#### Scenario: The fourth reset

- **WHEN** an account asks for a fourth reset in a day
- **THEN** the request is refused
`;

const INVOICE = `### Requirement: Invoice is issued per order

The system SHALL issue one invoice per order.

#### Scenario: An order is paid

- **WHEN** an order is paid
- **THEN** the system issues one invoice for it
`;

/** The main spec of `auth` the workspace carries before the change is archived. */
const STANDING_AUTH = `# auth

## Purpose

${AUTH_PURPOSE}

## Requirements

${HASHED_BEFORE}
${SESSION}
### Requirement: Sign-in is rate limited
${THROTTLE_BODY}`;

/** All four operations over one capability, in the order the sections are read. */
const AUTH_DELTA = `## Purpose

${AUTH_PURPOSE}

## ADDED Requirements

${RESET}
## MODIFIED Requirements

${HASHED_AFTER}
## REMOVED Requirements

${SESSION}
**Reason**: the token service ends a session now.

**Migration**: callers read the expiry from the token service.

## RENAMED Requirements

- FROM: \`### Requirement: Sign-in is rate limited\`
- TO: \`### Requirement: Sign-in is throttled\`
`;

/** A capability written for the first time: ADDED only, and a Purpose of its own. */
const BILLING_DELTA = `## Purpose

${BILLING_PURPOSE}

## ADDED Requirements

${INVOICE}`;

/**
 * What `auth` looks like after the merge: MODIFIED in place, REMOVED gone,
 * RENAMED under the new heading with the body it had, ADDED last. A block keeps
 * the blank line it stood with in the delta, so the last one ends the file with it.
 */
const MERGED_AUTH = `# auth

## Purpose

${AUTH_PURPOSE}

## Requirements

${HASHED_AFTER}
### Requirement: Sign-in is throttled
${THROTTLE_BODY}
${RESET}
`;

const MERGED_BILLING = `# billing

## Purpose

${BILLING_PURPOSE}

## Requirements

${INVOICE}`;

/** Every task closed, every requirement of both deltas named, every file real. */
const PLAN = [
  "## 1. Вход и счета",
  "",
  "- [x] 1.1 Написать сброс пароля с ограничением частоты в `src/auth/reset.ts`",
  "      -> auth#Password reset is rate limited",
  "- [x] 1.2 Переписать хеш пароля на argon2id в `src/auth/password.ts`",
  "      -> auth#Password is stored hashed",
  "- [x] 1.3 Убрать истечение сессии из `src/auth/session.ts`",
  "      -> auth#Session expires",
  "- [x] 1.4 Написать выпуск счёта в `src/billing/invoice.ts`",
  "      -> billing#Invoice is issued per order",
  "",
].join("\n");

/** Files the plan names. They are written after the commit, so they count as work. */
const WORK: Record<string, string> = {
  "src/auth/reset.ts": "export const resetsADay = 3;\n",
  "src/auth/password.ts": "export const algorithm = \"argon2id\";\n",
  "src/auth/session.ts": "export const expiry = null;\n",
  "src/billing/invoice.ts": "export const invoicesPerOrder = 1;\n",
};

const created: GitWorkspace[] = [];

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

function changeFiles(): Record<string, string> {
  return {
    "lexforge/config.yaml": CONFIG,
    "lexforge/specs/auth/spec.md": STANDING_AUTH,
    [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
    [`lexforge/changes/${CHANGE}/proposal.md`]: "## Why\n\nPasswords are stored in the open.\n",
    [`lexforge/changes/${CHANGE}/specs/auth/spec.md`]: AUTH_DELTA,
    [`lexforge/changes/${CHANGE}/specs/billing/spec.md`]: BILLING_DELTA,
    [`lexforge/changes/${CHANGE}/design.md`]: "## Context\n\nOne service, one database.\n",
    [`lexforge/changes/${CHANGE}/tasks.md`]: PLAN,
  };
}

/** A workspace with the change committed, the work on disk and a fresh stamp. */
async function project(extra: Record<string, string> = {}): Promise<string> {
  const made = createGitWorkspace({ ...changeFiles(), ...extra });
  created.push(made);

  for (const [file, content] of Object.entries(WORK)) {
    writeAt(made.root, file, content);
  }

  const recorded = await runCli(
    ["evidence", "record", "--change", CHANGE, "--label", "tests"],
    { cwd: made.root },
  );
  expect(recorded.code, recorded.stderr).toBe(0);

  return made.root;
}

/** Local date of the run: the archive directory is named with it. */
function today(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, "0");

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function read(root: string, file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

describe("сквозной круг архивации", () => {
  it("две capability и четыре операции дельты сливаются, каталог уезжает в архив", async () => {
    const root = await project();

    const result = await runCli(["archive", CHANGE], { cwd: root });

    expect(result.code, result.stderr).toBe(0);
    expect(read(root, "lexforge/specs/auth/spec.md")).toBe(MERGED_AUTH);
    expect(read(root, "lexforge/specs/billing/spec.md")).toBe(MERGED_BILLING);

    const archive = `lexforge/changes/archive/${today()}-${CHANGE}`;
    expect(existsSync(path.join(root, archive, "proposal.md"))).toBe(true);
    expect(existsSync(path.join(root, archive, "evidence.json"))).toBe(true);
    expect(existsSync(path.join(root, `lexforge/changes/${CHANGE}`))).toBe(false);
    expect(result.stdout).toContain(archive);
  });

  it("прерванное слияние доводится повторным вызовом", async () => {
    // Спеки записаны, каталог не перенесён: так выглядит прогон, оборвавшийся
    // между двумя шагами.
    const root = await project({
      "lexforge/specs/auth/spec.md": MERGED_AUTH,
      "lexforge/specs/billing/spec.md": MERGED_BILLING,
    });

    const result = await runCli(["archive", CHANGE], { cwd: root });

    expect(result.code, result.stderr).toBe(0);
    expect(read(root, "lexforge/specs/auth/spec.md")).toBe(MERGED_AUTH);
    expect(read(root, "lexforge/specs/billing/spec.md")).toBe(MERGED_BILLING);
    expect(
      existsSync(path.join(root, `lexforge/changes/archive/${today()}-${CHANGE}/tasks.md`)),
    ).toBe(true);
    expect(existsSync(path.join(root, `lexforge/changes/${CHANGE}`))).toBe(false);
  });
});
