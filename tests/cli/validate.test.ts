import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
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

const BROKEN_SPEC = `## Purpose

Keeps a requirement that nobody wrote a scenario for.

## ADDED Requirements

### Requirement: Empty requirement
`;

const RENAME_WITHOUT_PAIR = `${VALID_SPEC}
## RENAMED Requirements

- FROM: \`### Requirement: Change carries a delta spec\`
`;

function workspace(files: Record<string, string> = {}): string {
  const root = makeWorkspace({
    "lexforge/config.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-auth/proposal.md": "## Why\n\nPasswords are stored in the open.\n",
    "lexforge/changes/add-auth/specs/auth/spec.md": VALID_SPEC,
    "lexforge/changes/add-auth/design.md": "## Context\n\nOne service, one database.\n",
    "lexforge/changes/add-auth/tasks.md": "## 1. Login\n\n- [ ] 1.1 Write the failing test\n",
    ...files,
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

describe("lexforge validate", () => {
  it("машинный вывод несёт target, strict, findings, summary и следующий шаг", async () => {
    const root = workspace();

    const { exitCode, capture } = await call(
      ["validate", "add-auth", "--strict", "--json"],
      root,
    );
    const data = JSON.parse(capture.out) as {
      target: string;
      strict: boolean;
      findings: unknown[];
      summary: { errors: number; warnings: number };
      nextStep: string;
    };

    expect(exitCode).toBe(0);
    expect(data.target).toBe("add-auth");
    expect(data.strict).toBe(true);
    expect(data.findings).toEqual([]);
    expect(data.summary).toEqual({ errors: 0, warnings: 0 });
    expect(data.nextStep).not.toBe("");
  });

  it("находка даёт код 1 и печатается человеку", async () => {
    const root = workspace({ "lexforge/changes/add-auth/specs/auth/spec.md": BROKEN_SPEC });

    const { exitCode, capture } = await call(["validate", "add-auth"], root);

    expect(exitCode).toBe(1);
    expect(capture.err).toContain("lexforge/changes/add-auth/specs/auth/spec.md");
    expect(capture.err).toContain("requirement-without-scenario");
    expect(capture.out).toBe("");
  });

  it("строгий режим сообщает о секции переименования без пары и даёт код 1", async () => {
    const root = workspace({
      "lexforge/changes/add-auth/specs/auth/spec.md": RENAME_WITHOUT_PAIR,
    });

    const { exitCode, capture } = await call(["validate", "add-auth", "--strict"], root);

    expect(exitCode).toBe(1);
    expect(capture.err).toContain("renamed-pair-broken");
    expect(capture.err).toContain("lexforge/changes/add-auth/specs/auth/spec.md");
  });

  it("без флага строгого режима strict ложно", async () => {
    const root = workspace();

    const { capture } = await call(["validate", "add-auth", "--json"], root);
    const data = JSON.parse(capture.out) as { strict: boolean };

    expect(data.strict).toBe(false);
  });

  it("неизвестный change даёт код 2 и список активных changes", async () => {
    const root = workspace({
      "lexforge/changes/rename-menu/.lexforge.yaml": "schema: bounded\n",
    });

    const { exitCode, capture } = await call(["validate", "nosuch"], root);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("add-auth");
    expect(capture.err).toContain("rename-menu");
    expect(capture.out).toBe("");
  });

  it("без имени change команда отказывается работать с кодом 2", async () => {
    const root = workspace();

    const { exitCode, capture } = await call(["validate"], root);

    expect(exitCode).toBe(2);
    expect(capture.out).toBe("");
  });
});
