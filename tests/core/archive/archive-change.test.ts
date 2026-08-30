import { existsSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { archiveChange } from "../../../src/core/archive/archive-change.js";
import { recordEvidence } from "../../../src/core/gates/evidence-record.js";
import { createCapture } from "../../helpers/capture.js";
import { createGitWorkspace, writeAt, type GitWorkspace } from "../../helpers/git-workspace.js";

const CHANGE = "add-auth";

const CONFIG = `schema: spec-driven
verification:
  tests: node -e "process.exit(0)"
`;

const DELTA = `## Purpose

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
  "- [x] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
  "      -> auth#Password is stored hashed",
  "",
].join("\n");

const FILES: Record<string, string> = {
  "lexforge/config.yaml": CONFIG,
  [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
  [`lexforge/changes/${CHANGE}/proposal.md`]: "## Why\n\nPasswords are stored in the open.\n",
  [`lexforge/changes/${CHANGE}/specs/auth/spec.md`]: DELTA,
  [`lexforge/changes/${CHANGE}/design.md`]: "## Context\n\nOne service, one database.\n",
  [`lexforge/changes/${CHANGE}/tasks.md`]: PLAN,
};

const created: GitWorkspace[] = [];

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

/** A change that passes every check: closed plan, edited file, fresh stamp. */
async function cleanWorkspace(): Promise<string> {
  const made = createGitWorkspace(FILES);
  created.push(made);

  writeAt(made.root, "src/app.ts", 'export function app(): string {\n  return "hashed";\n}\n');

  const capture = createCapture();
  await recordEvidence({
    cwd: made.root,
    change: CHANGE,
    label: "tests",
    stdout: capture.stdout,
    stderr: capture.stderr,
  });

  return made.root;
}

describe("archiveChange", () => {
  it("имя каталога архива начинается с местной даты, поданной параметром", async () => {
    const root = await cleanWorkspace();

    const result = archiveChange({ cwd: root, change: CHANGE, now: new Date(2031, 0, 5) });

    expect(result.exitCode).toBe(0);
    expect(result.data.archivePath).toBe(`lexforge/changes/archive/2031-01-05-${CHANGE}`);
    expect(existsSync(path.join(root, `lexforge/changes/archive/2031-01-05-${CHANGE}`))).toBe(
      true,
    );
  });
});
