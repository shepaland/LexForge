import { afterEach, describe, expect, it } from "vitest";

import { namedSectionFiles, splitPlanIntoIndex } from "../helpers/plan-index.js";
import { runCli } from "../helpers/run-cli.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const CHANGE = "add-refunds";

// Reused word for word from `check-plan-command.test.ts`'s `SPEC` and `CLEAN`
// fixtures: a clean plan of one task naming one file and one requirement it
// satisfies. Only the file the task names changed, from `src/auth/store.ts`
// to `src/billing.ts`, 612 lines long on disk - the one long file the plan
// names, so the only finding a clean run can report is the one under test.
const SPEC = `## Purpose

Holds what the sign-in of the product does and what it refuses to do.

## ADDED Requirements

### Requirement: Password is stored hashed

The system SHALL store a password as a hash.

#### Scenario: A password is saved

- **WHEN** a user sets a password
- **THEN** the store holds a hash of it
`;

const PLAN = [
  "## 1. Вход",
  "",
  "Depends on: none",
  "",
  "- [ ] 1.1 [A] Написать хранение пароля в виде хеша в `src/billing.ts`",
  "      -> auth#Password is stored hashed",
  "",
].join("\n");

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

/** A workspace with the clean plan above, `.lexforge.yaml` set to `changeConfig`. */
function workspace(changeConfig: string): string {
  const { index, sections } = splitPlanIntoIndex(PLAN);
  const root = makeWorkspace({
    "lexforge/config.yaml": "schema: spec-driven\n",
    [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: changeConfig,
    [`lexforge/changes/${CHANGE}/proposal.md`]: "## Why\n\nRefunds have nowhere to live.\n",
    [`lexforge/changes/${CHANGE}/specs/auth/spec.md`]: SPEC,
    [`lexforge/changes/${CHANGE}/design.md`]: "## Context\n\nOne service, one database.\n",
    [`lexforge/changes/${CHANGE}/tasks.md`]: index,
    ...namedSectionFiles(`lexforge/changes/${CHANGE}`, sections),
    "src/billing.ts": "x\n".repeat(612),
  });
  created.push(root);
  return root;
}

describe("lexforge check plan: файл над пределом", () => {
  it("без long_files — код 1 и находка long-file-without-path", async () => {
    const root = workspace("schema: spec-driven\n");

    const { code, stdout } = await runCli(
      ["check", "plan", "--change", CHANGE, "--json"],
      { cwd: root },
    );
    const data = JSON.parse(stdout) as { findings: { rule: string }[] };

    expect(code).toBe(1);
    expect(data.findings).toHaveLength(1);
    expect(data.findings[0]!.rule).toBe("long-file-without-path");
  });

  it("long_files: keep — код 0", async () => {
    const root = workspace("schema: spec-driven\nlong_files: keep\n");

    const { code, stdout } = await runCli(
      ["check", "plan", "--change", CHANGE, "--json"],
      { cwd: root },
    );

    expect(code).toBe(0);
    expect((JSON.parse(stdout) as { findings: unknown[] }).findings).toEqual([]);
  });

  it("long_files: split — код 2, ошибка называет long_files, refactor и keep", async () => {
    const root = workspace("schema: spec-driven\nlong_files: split\n");

    const { code, stdout } = await runCli(
      ["check", "plan", "--change", CHANGE, "--json"],
      { cwd: root },
    );
    const data = JSON.parse(stdout) as { error: { message: string } };

    expect(code).toBe(2);
    expect(data.error.message).toContain("long_files");
    expect(data.error.message).toContain("refactor");
    expect(data.error.message).toContain("keep");
  });
});
