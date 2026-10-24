import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { archiveChange } from "../../../src/core/archive/archive-change.js";
import { recordEvidence } from "../../../src/core/gates/evidence-record.js";
import { createCapture } from "../../helpers/capture.js";
import { createGitWorkspace, writeAt, type GitWorkspace } from "../../helpers/git-workspace.js";
import { sealForVerify } from "../../helpers/verify-seal.js";

const CONFIG = `schema: spec-driven
verification:
  tests: node -e "process.exit(0)"
`;

const MAIN_SPEC = `# old

## Purpose

Holds two requirements, one of which may outlive the other.

## Requirements

### Requirement: Drop

The system SHALL keep the old export.

#### Scenario: Export runs

- **WHEN** a user exports
- **THEN** the old format is written

### Requirement: Keep

The system SHALL keep the import.

#### Scenario: Import runs

- **WHEN** a user imports
- **THEN** the file is read
`;

function removed(name: string): string {
  return `### Requirement: ${name}

**Reason** Nobody uses it.

**Migration** None.
`;
}

function delta(names: string[]): string {
  return `## Purpose

Removes what the product no longer does.

## REMOVED Requirements

${names.map(removed).join("\n")}`;
}

function plan(names: string[]): string {
  return [
    "## 1. Cleanup",
    "",
    "- [x] 1.1 Remove the old export from `src/app.ts`",
    ...names.map((name) => `      -> old#${name}`),
    "      Files: `src/app.ts`",
    "",
  ].join("\n");
}

let ws: GitWorkspace | undefined;
let root: string;
afterEach(() => ws?.remove());

/** A project whose spec `old` holds Drop and Keep, and a change that removes `names` from it. */
async function project(change: string, names: string[]): Promise<void> {
  const dir = `lexforge/changes/${change}`;
  ws = createGitWorkspace({
    "lexforge/config.yaml": CONFIG,
    "lexforge/specs/old/spec.md": MAIN_SPEC,
    [`${dir}/.lexforge.yaml`]: "schema: spec-driven\n",
    [`${dir}/proposal.md`]: "## Why\n\nThe old export is dead weight.\n",
    [`${dir}/specs/old/spec.md`]: delta(names),
    [`${dir}/design.md`]: "## Context\n\nOne service.\n",
    [`${dir}/tasks.md`]: plan(names),
  });
  root = ws.root;
  sealForVerify(root, change);
  writeAt(root, "src/app.ts", "export function app(): string {\n  return \"no export\";\n}\n");
  const capture = createCapture();
  await recordEvidence({ cwd: root, change, label: "tests", stdout: capture.stdout, stderr: capture.stderr });
}

describe("archive and a spec left without requirements", () => {
  it("removes the spec file when the delta removes every requirement", async () => {
    await project("drop-old", ["Drop", "Keep"]);
    const result = archiveChange({ cwd: root, change: "drop-old" });
    expect(result.exitCode, JSON.stringify(result.data.findings)).toBe(0);
    expect(existsSync(join(root, "lexforge/specs/old"))).toBe(false);
  });

  it("keeps the file when one requirement stays", async () => {
    await project("drop-one", ["Drop"]);
    const result = archiveChange({ cwd: root, change: "drop-one" });
    expect(result.exitCode, JSON.stringify(result.data.findings)).toBe(0);
    expect(readFileSync(join(root, "lexforge/specs/old/spec.md"), "utf8")).toContain("### Requirement: Keep");
  });
});
