import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { createGitWorkspace, writeAt, type GitWorkspace } from "../helpers/git-workspace.js";

export const CHANGE = "add-auth";

export const CONFIG = `schema: spec-driven
verification:
  tests: node -e "process.exit(0)"
`;

/** The delta of the change: one capability written for the first time. */
export const DELTA = `## Purpose

Holds what the sign-in of the product does and what it refuses to do.

## ADDED Requirements

### Requirement: Password is stored hashed

The system SHALL store a password as a hash.

#### Scenario: A password is saved

- **WHEN** a user sets a password
- **THEN** the store holds a hash of it
`;

/** A plan with one open task, so the checks have something to report. */
export const OPEN_PLAN = [
  "## 1. Вход",
  "",
  "- [x] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
  "      -> auth#Password is stored hashed",
  "- [ ] 1.2 Написать проверку пароля при входе в `src/app.ts`",
  "",
].join("\n");

/** Every task closed, the requirement named, the file it names edited. */
export const CLOSED_PLAN = [
  "## 1. Вход",
  "",
  "- [x] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
  "      -> auth#Password is stored hashed",
  "",
].join("\n");

export function changeFiles(tasks: string): Record<string, string> {
  return {
    "lexforge/config.yaml": CONFIG,
    [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
    [`lexforge/changes/${CHANGE}/proposal.md`]: "## Why\n\nPasswords are stored in the open.\n",
    [`lexforge/changes/${CHANGE}/specs/auth/spec.md`]: DELTA,
    [`lexforge/changes/${CHANGE}/design.md`]: "## Context\n\nOne service, one database.\n",
    [`lexforge/changes/${CHANGE}/tasks.md`]: tasks,
  };
}

export const created: GitWorkspace[] = [];

export function workspace(files: Record<string, string>): GitWorkspace {
  const made = createGitWorkspace(files);
  created.push(made);
  return made;
}

export async function call(argv: string[], cwd: string) {
  const capture = createCapture();
  const exitCode = await run(argv, { cwd, stdout: capture.stdout, stderr: capture.stderr });
  return { exitCode, capture };
}

/** The work of the change: a line the base commit does not carry. */
export function editApp(root: string): void {
  writeAt(root, "src/app.ts", 'export function app(): string {\n  return "hashed";\n}\n');
}

/**
 * Task 1.1 of every fixture plan in this file is ticked and names
 * `src/app.ts`, so the fifth measure of `verify` needs a red record for it.
 * Written through the CLI's own writer (`lexforge evidence red`), the same
 * way a real change would produce one.
 */
export async function recordRed(root: string, task = "1.1"): Promise<void> {
  const { exitCode, capture } = await call(
    ["evidence", "red", "--change", CHANGE, "--task", task, "--command", 'node -e "process.exit(1)"'],
    root,
  );

  if (exitCode !== 0) {
    throw new Error(`failed to record a red run for task ${task}: ${capture.err}`);
  }
}

/** Local date of the run, the form the archive directory is named with. */
export function today(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, "0");

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A change that passes every check: closed plan, edited file, fresh stamp. */
export async function cleanWorkspace(files: Record<string, string>): Promise<string> {
  const root = workspace(files).root;
  editApp(root);
  await recordRed(root);
  await call(["evidence", "record", "--change", CHANGE, "--label", "tests"], root);
  return root;
}

export interface ArchiveDocument {
  outputVersion: number;
  workspaceRoot: string;
  change: string;
  findings: { rule: string }[];
  summary: Record<string, number>;
  archivePath: string;
  nextStep: string;
}

export interface ErrorDocument {
  error: { code: string; message: string };
}

export async function errorCode(argv: string[], cwd: string): Promise<string> {
  const { capture } = await call([...argv, "--json"], cwd);
  return (JSON.parse(capture.out) as ErrorDocument).error.code;
}
