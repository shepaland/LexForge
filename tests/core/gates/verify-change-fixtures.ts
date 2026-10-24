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
