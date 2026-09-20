import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "../helpers/run-cli.js";
import {
  createGitWorkspace,
  writeAt,
  type GitWorkspace,
} from "../helpers/git-workspace.js";

// Fixture reused word for word from `tests/cli/verify.test.ts` (CONFIG,
// AUTH_SPEC, the closed-plan task naming `src/app.ts`, `editApp`, `redRun`):
// a change with its one task closed, its red record in place and its
// "tests" label freshly stamped. The only reason this change is not clean
// is `src/cart.ts`, added to the base commit at 380 lines and grown past
// the limit afterwards.
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

const CLOSED_PLAN = [
  "## 1. Вход",
  "",
  "- [x] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
  "      -> auth#Password is stored hashed",
  "",
].join("\n");

/** `count` numbered lines, each ending in `\n`, so `wc -l` reads exactly `count`. */
function lines(count: number): string {
  return Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n") + "\n";
}

const created: GitWorkspace[] = [];

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

/** A git workspace at the base commit: the closed plan, `src/cart.ts` at 380 lines. */
function workspace(): GitWorkspace {
  const made = createGitWorkspace({
    "lexforge/config.yaml": CONFIG,
    [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
    [`lexforge/changes/${CHANGE}/proposal.md`]: "## Why\n\nPasswords are stored in the open.\n",
    [`lexforge/changes/${CHANGE}/specs/auth/spec.md`]: AUTH_SPEC,
    [`lexforge/changes/${CHANGE}/design.md`]: "## Context\n\nOne service, one database.\n",
    [`lexforge/changes/${CHANGE}/tasks.md`]: CLOSED_PLAN,
    "src/cart.ts": lines(380),
  });
  created.push(made);
  return made;
}

/** The work of the change: a line the base commit does not carry. */
function editApp(root: string): void {
  writeAt(root, "src/app.ts", 'export function app(): string {\n  return "hashed";\n}\n');
}

/** Records a red run for task 1.1 through the CLI, the only lawful way to write one. */
async function redRun(root: string): Promise<void> {
  await runCli(
    ["evidence", "red", "--change", CHANGE, "--task", "1.1", "--command", 'node -e "process.exit(1)"'],
    { cwd: root },
  );
}

interface VerifyDocument {
  findings: { rule: string; message: string }[];
  dimensions: string[];
  summary: { filesOverLimit: number };
}

/**
 * Closes the plan's own dimensions: red run recorded, "tests" label stamped
 * against the tree as it stands once `grow` has run - a stamp taken before
 * `src/cart.ts` grows would go stale the moment it does, and that staleness
 * is not the finding this test is after.
 */
async function closeTheRest(root: string, grow?: () => void): Promise<void> {
  editApp(root);
  grow?.();
  await redRun(root);
  await runCli(["evidence", "record", "--change", CHANGE, "--label", "tests"], { cwd: root });
}

describe("lexforge verify: шестое измерение — предел строк", () => {
  it("файл, выросший за предел, даёт находку file-over-line-limit, код 1", async () => {
    const root = workspace().root;
    await closeTheRest(root, () => writeAt(root, "src/cart.ts", lines(420)));

    const { code, stdout } = await runCli(["verify", "--change", CHANGE, "--json"], {
      cwd: root,
    });
    const data = JSON.parse(stdout) as VerifyDocument;

    expect(code).toBe(1);
    expect(data.findings.map((finding) => finding.rule)).toContain("file-over-line-limit");
    expect(data.summary.filesOverLimit).toBe(1);
    expect(data.dimensions).toHaveLength(6);
    expect(data.dimensions.some((item) => item.includes("line limit"))).toBe(true);

    const human = await runCli(["verify", "--change", CHANGE], { cwd: root });
    expect(human.stderr).toContain("file-over-line-limit");
    expect(human.stderr).toContain("line limit");
  });

  it("тот же change с src/cart.ts на 380 строках даёт код 0", async () => {
    const root = workspace().root;
    await closeTheRest(root);

    const { code, stdout } = await runCli(["verify", "--change", CHANGE, "--json"], {
      cwd: root,
    });
    const data = JSON.parse(stdout) as VerifyDocument;

    expect(code).toBe(0);
    expect(data.findings).toEqual([]);
    expect(data.summary.filesOverLimit).toBe(0);
  });

  it("verify --help не предлагает флаг, запускающий одно измерение", async () => {
    const root = workspace().root;

    const { stdout } = await runCli(["verify", "--help"], { cwd: root });
    const flagLines = stdout.split("\n").filter((line) => /^\s+--/.test(line));

    expect(flagLines).toHaveLength(2);
    expect(stdout).toContain("--change");
    expect(stdout).toContain("--json");
  });
});
