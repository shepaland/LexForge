import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { openFeatureBranch } from "../../src/core/git/feature-branch.js";
import { run } from "../../src/cli/run.js";
import { createCapture } from "./capture.js";
import { createGitWorkspace, type GitWorkspace } from "./git-workspace.js";

/** The change every plan test works on. */
export const CHANGE = "demo";
export const CHANGE_DIR = `lexforge/changes/${CHANGE}`;

const SPEC = `## Purpose

Holds what the greeting of the product does and what it refuses to do.

## ADDED Requirements

### Requirement: Hello is returned

The system SHALL return hello.

#### Scenario: Hello is read

- **WHEN** the greeting is read
- **THEN** the system returns hello
`;

const SECTION_1 = `## 1. Greeting

Depends on: none

- [ ] 1.1 Write the greeting check in \`tests/check.cjs\`
      -> greet#Hello is returned
      Files: \`tests/check.cjs\`
      Test: \`tests/check.cjs\`
      Command: \`node tests/check.cjs\`
- [ ] 1.2 Implement the greeting in \`src/message.txt\`
      -> greet#Hello is returned
      Files: \`src/message.txt\`
      Test: \`tests/check.cjs\`
      Command: \`node tests/check.cjs\`
      Depends on: 1.1
`;

const SECTION_2 = `## 2. Farewell

Depends on: 1

- [ ] 2.1 Implement the farewell in \`src/bye.txt\`
      -> greet#Hello is returned
      Files: \`src/bye.txt\`
      Test: \`tests/check.cjs\`
      Command: \`node tests/check.cjs\`
`;

const INDEX = `## 1. Greeting

\`tasks/section-1.md\`

## 2. Farewell

\`tasks/section-2.md\`
`;

/** The files of a change with a valid two-section plan, keyed by path under the root. */
export function planFiles(): Record<string, string> {
  return {
    [`${CHANGE_DIR}/.lexforge.yaml`]: "schema: spec-driven\n",
    [`${CHANGE_DIR}/proposal.md`]: "## Why\n\nA greeting is missing.\n",
    [`${CHANGE_DIR}/design.md`]: "## Context\n\nOne text file.\n",
    [`${CHANGE_DIR}/specs/greet/spec.md`]: SPEC,
    [`${CHANGE_DIR}/tasks.md`]: INDEX,
    [`${CHANGE_DIR}/tasks/section-1.md`]: SECTION_1,
    [`${CHANGE_DIR}/tasks/section-2.md`]: SECTION_2,
  };
}

function sectionFile(root: string, id: string): string {
  return path.join(root, CHANGE_DIR, "tasks", `section-${id.split(".")[0]}.md`);
}

/** `- [ ] 1.1` becomes `- [x] 1.1` in the section file. */
export function tick(root: string, id: string): void {
  const file = sectionFile(root, id);
  const text = readFileSync(file, "utf8");
  writeFileSync(file, text.replace(`- [ ] ${id} `, `- [x] ${id} `));
}

/** Replaces the first word of the task line with `word`. */
export function edit(root: string, id: string, word: string): void {
  const file = sectionFile(root, id);
  const text = readFileSync(file, "utf8");
  writeFileSync(file, text.replace(new RegExp(`(\\[.\\] ${id.replace(".", "\\.")} )\\S+`), `$1${word}`));
}

/** Appends a task with the given id to the section file of that id. */
export function appendTask(root: string, id: string): void {
  const file = sectionFile(root, id);
  const text = readFileSync(file, "utf8").replace(/\n*$/, "\n");
  writeFileSync(
    file,
    `${text}- [ ] ${id} Extend the greeting in \`src/extra.txt\`
      -> greet#Hello is returned
      Files: \`src/extra.txt\`
      Test: \`tests/check.cjs\`
      Command: \`node tests/check.cjs\`
`,
  );
}

/** A review report in the format `parseReviewReport` reads. */
export function reportText(
  verdict: "approved" | "changes-requested",
  findings: string[] = [],
  controls = "none",
): string {
  return [
    "Reviewer: plan-reviewer-1",
    `Verdict: ${verdict}`,
    `Controls: ${controls}`,
    "Findings:",
    ...(findings.length === 0 ? ["- none"] : findings),
    "",
  ].join("\n");
}

/** A workspace in git with the `demo` plan committed and `feature/demo` checked out from `dev`. */
export function createPlanWorkspace(): GitWorkspace {
  const ws = createGitWorkspace(planFiles());
  openFeatureBranch(ws.root, CHANGE);
  return ws;
}

export interface CliCall {
  exitCode: number;
  json: { data?: Record<string, any>; error?: { code: string; message: string }; nextStep?: string };
}

/** Runs one CLI command in the workspace with `--json` and reads the document it printed. */
export async function cli(root: string, argv: string[]): Promise<CliCall> {
  const capture = createCapture();
  const exitCode = await run([...argv, "--json"], { cwd: root, stdout: capture.stdout, stderr: capture.stderr });
  const json = capture.out.trim() === "" ? {} : JSON.parse(capture.out);
  // A success prints `data` alone; a refusal prints `{ error, nextStep }`.
  return { exitCode, json: json.error ? json : { data: json } };
}

let reportCounter = 0;
let reportDir: string | undefined;

/** Writes a report file under the workspace and returns its path. */
export function writeReport(root: string, text: string): string {
  reportCounter += 1;
  // Outside the workspace: a report left in it would count as work before approval.
  reportDir ??= mkdtempSync(path.join(os.tmpdir(), "lexforge-reports-"));
  const file = path.join(reportDir, `report-${reportCounter}.md`);
  writeFileSync(file, text);
  return file;
}

/** `plan review` of one angle with a fresh report of the given verdict. */
export async function review(
  root: string,
  angle: string,
  verdict: "approved" | "changes-requested" = "approved",
  finding?: string,
): Promise<CliCall> {
  const file = writeReport(root, reportText(verdict, finding ? [finding] : []));
  return cli(root, ["plan", "review", "--change", CHANGE, "--angle", angle, "--file", file]);
}

export async function allFourApproved(root: string): Promise<void> {
  for (const angle of ["specs", "code", "dependencies", "gaps"]) {
    const result = await review(root, angle);
    if (result.exitCode !== 0) throw new Error(`review ${angle} failed: ${JSON.stringify(result.json)}`);
  }
}

export function approveCall(root: string, quote = "да, делай"): Promise<CliCall> {
  return cli(root, ["plan", "approve", "--change", CHANGE, "--quote", quote]);
}

export function amendCall(root: string, quote = "добавь задачу"): Promise<CliCall> {
  return cli(root, ["plan", "amend", "--change", CHANGE, "--quote", quote]);
}

/** Four approved reviews and the approval itself. */
export async function approved(root: string): Promise<void> {
  await allFourApproved(root);
  const result = await approveCall(root);
  if (result.exitCode !== 0) throw new Error(`approve failed: ${JSON.stringify(result.json)}`);
}
