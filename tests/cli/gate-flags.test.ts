import type { Command } from "commander";

import { afterEach, describe, expect, it } from "vitest";

import { createCliContext, createProgram, run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { createGitWorkspace, type GitWorkspace } from "../helpers/git-workspace.js";

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

const PLAN = [
  "## 1. Вход",
  "",
  "- [x] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
  "      -> auth#Password is stored hashed",
  "",
].join("\n");

/**
 * Every flag each gate takes. The list is written out here on purpose: a flag
 * added to a gate has to be added to this test too, and that is the moment to
 * ask whether the new flag lets the caller pass a check they did not pass.
 */
const GATE_FLAGS: Array<[string, string[], string[]]> = [
  ["check plan", ["check", "plan"], ["--change", "--json"]],
  ["check evidence", ["check", "evidence"], ["--change", "--require", "--json"]],
  ["evidence record", ["evidence", "record"], ["--change", "--label", "--json"]],
  ["verify", ["verify"], ["--change", "--json"]],
];

const created: GitWorkspace[] = [];

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

function workspace(): string {
  const made = createGitWorkspace({
    "lexforge/config.yaml": CONFIG,
    [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
    [`lexforge/changes/${CHANGE}/proposal.md`]: "## Why\n\nPasswords are stored in the open.\n",
    [`lexforge/changes/${CHANGE}/specs/auth/spec.md`]: AUTH_SPEC,
    [`lexforge/changes/${CHANGE}/design.md`]: "## Context\n\nOne service, one database.\n",
    [`lexforge/changes/${CHANGE}/tasks.md`]: PLAN,
  });
  created.push(made);
  return made.root;
}

/** The command the path names, walked down from the program. */
function commandAt(path: string[]): Command {
  const capture = createCapture();
  let command: Command = createProgram(
    createCliContext({ cwd: process.cwd(), stdout: capture.stdout, stderr: capture.stderr }),
  );

  for (const name of path) {
    const found = command.commands.find((child) => child.name() === name);
    expect(found, `command ${path.join(" ")} is not registered`).toBeDefined();
    command = found!;
  }

  return command;
}

async function call(argv: string[], cwd: string): Promise<number> {
  const capture = createCapture();
  return run(argv, { cwd, stdout: capture.stdout, stderr: capture.stderr });
}

describe("у ворот нет послаблений", () => {
  for (const [name, path, flags] of GATE_FLAGS) {
    it(`${name}: принимает только ${flags.join(", ")}`, () => {
      const taken = commandAt(path)
        .options.map((option) => option.long ?? option.short ?? "")
        .sort();

      expect(taken).toEqual([...flags].sort());
    });

    it(`${name}: неизвестный флаг даёт код 2`, async () => {
      const code = await call(
        [...path, "--change", CHANGE, "--allow-open-tasks"],
        workspace(),
      );

      expect(code).toBe(2);
    });

    it(`${name}: лишний позиционный аргумент даёт код 2`, async () => {
      const code = await call([...path, "--change", CHANGE, "everything-is-fine"], workspace());

      expect(code).toBe(2);
    });
  }
});
