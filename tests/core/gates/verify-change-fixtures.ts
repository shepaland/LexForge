import { createGitWorkspace, type GitWorkspace } from "../../helpers/git-workspace.js";
import type { RedRunRecord } from "../../../src/core/gates/red-run-store.js";

export const CONFIG = `schema: spec-driven
verification:
  tests: node -e "process.exit(0)"
`;

export const AUTH_SPEC = `## Purpose

Holds what the sign-in of the product does and what it refuses to do.

## ADDED Requirements

### Requirement: Password is stored hashed

The system SHALL store a password as a hash.

#### Scenario: A password is saved

- **WHEN** a user sets a password
- **THEN** the store holds a hash of it
`;

export const CHANGE = "add-auth";

/** A red record good enough for the fifth dimension: any non-zero exit code. */
export const RED_RECORD: RedRunRecord = {
  command: "npx vitest run tests/core/gates/example.test.ts",
  exitCode: 1,
  startedAt: "2026-08-30T09:12:44.281Z",
  durationMs: 1200,
  head: "9f1c0b7a4e1d2c3b5a6f7e8d9c0b1a2f3e4d5c6b",
  worktreeDigest: "sha256:1f0a",
  outputTail: "FAIL",
  outputTruncated: false,
};

/** Swallows the output of the check the ledger stamp is taken from. */
export const SILENT = { write: () => true };

/** Workspaces `workspace` has made, removed in each file's own `afterEach`. */
export const created: GitWorkspace[] = [];

export function workspace(tasks: string, files: Record<string, string> = {}): GitWorkspace {
  const made = createGitWorkspace({
    "lexforge/config.yaml": CONFIG,
    [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
    [`lexforge/changes/${CHANGE}/proposal.md`]: "## Why\n\nPasswords are stored in the open.\n",
    [`lexforge/changes/${CHANGE}/specs/auth/spec.md`]: AUTH_SPEC,
    [`lexforge/changes/${CHANGE}/design.md`]: "## Context\n\nOne service, one database.\n",
    [`lexforge/changes/${CHANGE}/tasks.md`]: tasks,
    ...files,
  });
  created.push(made);
  return made;
}
