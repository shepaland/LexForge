import { createGitWorkspace, type GitWorkspace } from "../../helpers/git-workspace.js";
import { sealForVerify } from "../../helpers/verify-seal.js";

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

/** Swallows the output of the check the ledger stamp is taken from. */
export const SILENT = { write: () => true };

/** Workspaces `workspace` has made, removed in each file's own `afterEach`. */
export const created: GitWorkspace[] = [];

/**
 * Hands control back to the event loop. Every case here drives git through
 * `execFileSync`, which blocks the worker's event loop for its whole call;
 * run back to back across a file with dozens of cases, that adds up past
 * the minute vitest's own runner gives a queued `onTaskUpdate` to be
 * acknowledged, and the file times out on that exchange even though every
 * test in it passed. Called from each file's own `afterEach`, one macrotask
 * after the test is enough for that queued call to be acknowledged before
 * its clock runs out.
 */
export function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

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
  sealForVerify(made.root, CHANGE);
  created.push(made);
  return made;
}
