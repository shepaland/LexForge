import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const created: string[] = [];

const INTERACTION_SPEC = `## Purpose

Accepts uploaded files from the web client and hands them to storage.

## ADDED Requirements

### Requirement: Web uploads a file to ingest

The system SHALL accept an upload from the web client.

Interaction: web -> ingest

#### Scenario: Upload is accepted

- **WHEN** the web client sends a file
- **THEN** ingest stores it
`;

function workspace(): string {
  const root = makeWorkspace({
    "lexforge/config.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-ingest/.lexforge.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-ingest/proposal.md": "## Why\n\nUploads have no entry point.\n",
    "lexforge/changes/add-ingest/specs/ingest/spec.md": INTERACTION_SPEC,
    "lexforge/changes/add-ingest/design.md": "## Context\n\nOne service, one database.\n",
    "lexforge/changes/add-ingest/tasks.md": "## 1. Upload\n\n- [ ] 1.1 Write the failing test\n",
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

interface Report {
  findings: { rule: string }[];
}

describe("lexforge validate on an interaction requirement", () => {
  it("strict mode exits 1 with interaction-diagram-missing", async () => {
    const { exitCode, capture } = await call(["validate", "add-ingest", "--strict", "--json"], workspace());
    const data = JSON.parse(capture.out) as Report;

    expect(exitCode, "\nValidate does not check interactions\n").toBe(1);
    expect(data.findings.map((finding) => finding.rule)).toContain("interaction-diagram-missing");
  });

  it("without strict mode no such finding is raised", async () => {
    const { capture } = await call(["validate", "add-ingest", "--json"], workspace());
    const data = JSON.parse(capture.out) as Report;

    expect(data.findings.map((finding) => finding.rule)).not.toContain("interaction-diagram-missing");
  });
});
