import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { openFeatureBranch } from "../../src/core/git/feature-branch.js";
import { taskWorktreePath } from "../../src/core/tasks/paths.js";
import { planDigest, planTaskTexts, readPlanState, writePlanState } from "../../src/core/tasks/plan-state.js";
import { readTaskRecord, writeTaskRecord } from "../../src/core/tasks/records.js";
import { createGitWorkspace, git, writeAt, type GitWorkspace } from "./git-workspace.js";
import { CHANGE, cli, type CliCall } from "./plan-fixture.js";

export { CHANGE, cli, type CliCall };
export const CHANGE_DIR = `lexforge/changes/${CHANGE}`;

const SPEC = `## Purpose

How notes are searched.

## ADDED Requirements

### Requirement: Search over note text

The system SHALL return the notes whose text holds the query.

#### Scenario: A word in one note

- **WHEN** the query is a word of one note
- **THEN** that note is returned

### Requirement: Unrelated

The system SHALL keep notes.
`;

const DESIGN = `## Context

Notes are strings.

## Decisions

Search is a plain substring match.

## Risks

None.
`;

function task(id: string, title: string, fields: string[]): string {
  return [`- [ ] ${id} ${title}`, "      -> notes#Search over note text", ...fields.map((f) => `      ${f}`)].join("\n");
}

/** A plan of seven independent sections; task 1.2 waits for 1.1, and 2.1 and 3.1 share `src/notes.js`. */
export const TASKS = `## 1. Search

Depends on: none

${task("1.1", "Search over note text", ["Files: `src/notes.js`, `test/notes.test.mjs`", "Test: `test/notes.test.mjs`", "Command: `node --test test/notes.test.mjs`"])}
${task("1.2", "Rank search results", ["Files: `src/rank.js`, `test/rank.test.mjs`", "Test: `test/rank.test.mjs`", "Command: `node --test test/rank.test.mjs`", "Depends on: 1.1"])}

## 2. Tags

Depends on: none

${task("2.1", "Tag notes", ["Files: `src/tags.js`, `src/notes.js`, `test/tags.test.mjs`", "Test: `test/tags.test.mjs`", "Command: `node --test test/tags.test.mjs`"])}

## 3. Archive

Depends on: none

${task("3.1", "Archive notes", ["Files: `src/notes.js`, `test/archive.test.mjs`", "Test: `test/archive.test.mjs`", "Command: `node --test test/archive.test.mjs`"])}

## 4. Export

Depends on: none

${task("4.1", "Export notes", ["Files: `src/export.js`, `test/export.test.mjs`", "Test: `test/export.test.mjs`", "Command: `node --test test/export.test.mjs`"])}

## 5. Packages

Depends on: none

${task("5.1", "Pad note titles", ["Files: `src/pad.js`, `test/needs-pkg.mjs`", "Test: `test/needs-pkg.mjs`", "Command: `node test/needs-pkg.mjs`"])}

## 6. Layout

Depends on: none

${task("6.1", "(move) Move the search helpers", ["Files: `src/helpers.js`, `src/search-helpers.js`", "Command: `node -e \"0\"`"])}

## 7. Storage

Depends on: none

${task("7.1", "Migrate note storage", ["Files: `src/storage.js`, `test/storage.test.mjs`", "Test: `test/storage.test.mjs`", "Command: `node --test test/storage.test.mjs`", "Controls: migrations"])}
`;

export const BASE_NOTES = "export function searchNotes() {\n  return [];\n}\n";
export const IMPL =
  "export function searchNotes(notes, query) {\n  return notes.filter((note) => note.includes(query));\n}\n";
export const WRONG_IMPL = "export function searchNotes(notes) {\n  return notes;\n}\n";
export const FIXED_IMPL = `// FIXED\n${IMPL}`;
const HEADER = 'import { test } from "node:test";\nimport assert from "node:assert/strict";\n';
export const FAILING_TEST = `${HEADER}import { searchNotes } from "../src/notes.js";
test("search", () => assert.deepEqual(searchNotes(["a b", "c"], "b"), ["a b"]));
`;
export const PASSING_TEST = `${HEADER}test("always", () => assert.ok(true));\n`;
export const WEAKER_TEST = `${HEADER}import { searchNotes } from "../src/notes.js";
test("search", () => assert.ok(Array.isArray(searchNotes(["a"], "a"))));
`;
export const IMPORTS_MISSING_PACKAGE = 'import pad from "left-pad";\nconsole.log(pad("a", 3));\n';

export interface TaskOptions {
  approved?: boolean;
  setup?: string;
}

/** A repository on `feature/demo` with the plan committed and, unless told otherwise, approved. */
export function createTaskWorkspace(tasks: string = TASKS, options: TaskOptions = {}): GitWorkspace {
  const setup = options.setup ? `worktree:\n  setup: ${JSON.stringify(options.setup)}\n` : "";
  const ws = createGitWorkspace({
    "lexforge/config.yaml": `schema: spec-driven\nengineering:\n  stacks: []\n${setup}`,
    [`${CHANGE_DIR}/.lexforge.yaml`]: "schema: spec-driven\n",
    [`${CHANGE_DIR}/proposal.md`]: "## Why\n\nNotes cannot be searched.\n",
    [`${CHANGE_DIR}/design.md`]: DESIGN,
    [`${CHANGE_DIR}/specs/notes/spec.md`]: SPEC,
    [`${CHANGE_DIR}/tasks.md`]: tasks,
    "src/notes.js": BASE_NOTES,
  });
  openFeatureBranch(ws.root, CHANGE);
  if (options.approved !== false) approvePlanDirectly(ws.root);
  return ws;
}

/** Writes the approval the way `plan approve` does, without the four reviews it needs. */
export function approvePlanDirectly(root: string): void {
  const state = readPlanState(root, CHANGE);
  state.approval = {
    quote: "да",
    digest: planDigest(root, CHANGE),
    base: git(root, "rev-parse", "HEAD"),
    taskTexts: planTaskTexts(root, CHANGE),
    at: new Date().toISOString(),
  };
  writePlanState(root, CHANGE, state);
}

/** Writes the files in the directory and commits them there. */
export function commitIn(dir: string, files: Record<string, string>, message = "work"): string {
  for (const [file, content] of Object.entries(files)) writeAt(dir, file, content);
  git(dir, "add", "--all");
  git(dir, "commit", "--message", message);
  return head(dir);
}

export function head(dir: string): string {
  return git(dir, "rev-parse", "HEAD");
}

let reportDir: string | undefined;
let reportCount = 0;

/** A task review report in the format `parseReviewReport` reads, written outside the workspace. */
export function report(
  options: { reviewer?: string; verdict?: string; controls?: string[]; findings?: string[] } = {},
): string {
  const text = [
    `Reviewer: ${options.reviewer ?? "rev-1"}`,
    `Verdict: ${options.verdict ?? "approved"}`,
    `Controls: ${options.controls && options.controls.length > 0 ? options.controls.join(", ") : "none"}`,
    "Findings:",
    ...(options.findings && options.findings.length > 0 ? options.findings : ["- none"]),
    "",
  ].join("\n");
  reportDir ??= mkdtempSync(path.join(os.tmpdir(), "lexforge-task-reports-"));
  reportCount += 1;
  const file = path.join(reportDir, `report-${reportCount}.md`);
  writeFileSync(file, text);
  return file;
}

/** The task commands of one workspace, and the steps that bring a task to a given point. */
export function taskSteps(root: string) {
  const call = (verb: string, id: string, extra: string[] = []) =>
    cli(root, ["task", verb, "--change", CHANGE, "--task", id, ...extra]);
  const steps = {
    wt: (id: string) => taskWorktreePath(root, CHANGE, id),
    reportMd: (id: string) => path.join(root, CHANGE_DIR, "tasks", id, "report.md"),
    reviewMd: (id: string) => path.join(root, CHANGE_DIR, "tasks", id, "review.md"),
    start: (id: string, executor = "exec-1") => call("start", id, ["--executor", executor]),
    red: (id: string) => call("red", id),
    green: (id: string) => call("green", id),
    review: (id: string, file: string) => call("review", id, ["--file", file]),
    close: (id: string) => call("close", id),
    abandon: (id: string) => call("abandon", id),
    /** Started, the failing test committed and recorded as red, the executor's report written. */
    async redDone(id: string, test = FAILING_TEST): Promise<void> {
      expectOk(await steps.start(id), "start");
      commitIn(steps.wt(id), { [testOf(id)]: test }, "test");
      expectOk(await steps.red(id), "red");
      writeAt(root, `${CHANGE_DIR}/tasks/${id}/report.md`, "executor says: done");
    },
    /** Red done, the implementation committed and recorded as green. */
    async greenDone(id: string, impl = IMPL): Promise<string> {
      await steps.redDone(id, id === "7.1" ? PASSING_STORAGE_RED : FAILING_TEST);
      const commit = commitIn(steps.wt(id), { [implOf(id)]: id === "7.1" ? STORAGE_IMPL : impl }, "impl");
      expectOk(await steps.green(id), "green");
      return commit;
    },
    async reviewed(id: string, verdict = "approved", findings: string[] = []): Promise<string> {
      const commit = await steps.greenDone(id);
      expectOk(await steps.review(id, report({ verdict, findings })), "review");
      return commit;
    },
    approvedReview: (id: string) => steps.reviewed(id, "approved"),
  };
  return steps;
}

const PASSING_STORAGE_RED = `${HEADER}import { save } from "../src/storage.js";
test("save", () => assert.equal(save(), "saved"));
`;
const STORAGE_IMPL = 'export function save() {\n  return "saved";\n}\n';

function testOf(id: string): string {
  return id === "7.1" ? "test/storage.test.mjs" : "test/notes.test.mjs";
}

function implOf(id: string): string {
  return id === "7.1" ? "src/storage.js" : "src/notes.js";
}

/** The checkbox line of a task in `tasks.md`. */
export function planLine(root: string, id: string): string {
  const lines = readFileSync(path.join(root, CHANGE_DIR, "tasks.md"), "utf8").split("\n");
  return lines.find((line) => line.startsWith(`- [ ] ${id} `) || line.startsWith(`- [x] ${id} `)) ?? "";
}

/** Resets the task branch to its base and commits test and code at once, so the recorded red is gone. */
export function rewriteHistoryDroppingRed(root: string, id: string): void {
  const record = readTaskRecord(root, CHANGE, id)!;
  git(record.worktree, "reset", "--hard", record.base);
  commitIn(record.worktree, { [testOf(id)]: FAILING_TEST, [implOf(id)]: IMPL }, "test and code");
}

/** Commits test and code together and writes that commit as the red one, past `task red`. */
export function pointRedRecordAtCodeCommit(root: string, id: string): void {
  const record = readTaskRecord(root, CHANGE, id)!;
  const commit = commitIn(record.worktree, { [testOf(id)]: `${FAILING_TEST}// again\n`, [implOf(id)]: FIXED_IMPL });
  writeTaskRecord(root, CHANGE, { ...record, red: { ...record.red!, commit } });
}

/** Commits files on the change branch in the main worktree. */
export function commitOnChangeBranch(root: string, files: Record<string, string>): string {
  return commitIn(root, files, "change branch moves on");
}

export function expectOk(result: CliCall, what: string): void {
  if (result.exitCode !== 0) throw new Error(`${what} failed: ${JSON.stringify(result.json)}`);
}
