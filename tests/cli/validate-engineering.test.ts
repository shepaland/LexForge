import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const EXPECTED = "\nValidate does not check the engineering settings\n";
const created: string[] = [];

const SPEC = `## Purpose

Reads the delta spec of a change and reports what the scanner finds in it.

## ADDED Requirements

### Requirement: Change carries a delta spec

The system SHALL read the delta spec of the change.

#### Scenario: Delta spec is written

- **WHEN** the change directory holds one spec file
- **THEN** the scanner reports one requirement
`;

function workspace(config: string): string {
  const root = makeWorkspace({
    "lexforge/config.yaml": config,
    "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-auth/proposal.md": "## Why\n\nPasswords are stored in the open.\n",
    "lexforge/changes/add-auth/specs/auth/spec.md": SPEC,
    "lexforge/changes/add-auth/design.md": "## Context\n\nOne service, one database.\n",
    "lexforge/changes/add-auth/tasks.md": "## 1. Login\n\n- [ ] 1.1 Write the failing test\n",
  });
  created.push(root);
  return root;
}

const EMPTY_REASON = 'schema: spec-driven\nengineering:\n  disabled:\n    BE-05: ""\n';
const CLEAN = 'schema: spec-driven\nengineering:\n  disabled:\n    BE-05: "generated code"\n';

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

interface Report {
  findings: { file: string; rule: string }[];
}

async function call(argv: string[], cwd: string) {
  const capture = createCapture();
  const exitCode = await run(argv, { cwd, stdout: capture.stdout, stderr: capture.stderr });
  return { exitCode, data: JSON.parse(capture.out) as Report };
}

describe("lexforge validate on the engineering settings", () => {
  it("strict mode exits 1 with engineering-disabled-reason on config.yaml", async () => {
    const { exitCode, data } = await call(["validate", "add-auth", "--strict", "--json"], workspace(EMPTY_REASON));

    expect(exitCode, EXPECTED).toBe(1);
    expect(
      data.findings.some((item) => item.rule === "engineering-disabled-reason" && item.file === "lexforge/config.yaml"),
      EXPECTED,
    ).toBe(true);
  });

  it("without strict mode no such finding is raised", async () => {
    const { data } = await call(["validate", "add-auth", "--json"], workspace(EMPTY_REASON));

    expect(data.findings.map((item) => item.rule)).not.toContain("engineering-disabled-reason");
  });

  it("clean settings exit 0 in strict mode", async () => {
    const { exitCode, data } = await call(["validate", "add-auth", "--strict", "--json"], workspace(CLEAN));

    expect(data.findings).toEqual([]);
    expect(exitCode).toBe(0);
  });
});
