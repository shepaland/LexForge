import { afterEach, expect } from "vitest";
import { run } from "../../src/cli/run.js";
import { createCapture } from "./capture.js";
import {
  createGitWorkspace,
  writeAt,
  type GitWorkspace,
} from "./git-workspace.js";
const made: GitWorkspace[] = [];
export const dir = "lexforge/changes/demo";
const command = "node tests/check.cjs";
export const cycle = {
  id: "greeting",
  tasks: ["1.1", "1.2"],
  dependsOn: [],
  files: [
    { path: "src/message.txt", symbols: [] },
    { path: "tests/check.cjs", symbols: [] },
  ],
  testFiles: ["tests/check.cjs"],
  inputs: ["package.json"],
  environment: ["LEXFORGE_TEST_ENV"],
  command,
  expectedFailure: "EXPECTED hello",
  design: [{ path: `${dir}/design.md`, heading: "Greeting" }],
  acceptance: [{ id: "AC1", task: "1.2", description: "returns hello" }],
  controls: [],
};
export function fixture() {
  const ws = createGitWorkspace({
    "lexforge/config.yaml":
      "schema: spec-driven\nverification:\n  tests: node tests/check.cjs\n",
    [`${dir}/.lexforge.yaml`]: "schema: spec-driven\n",
    [`${dir}/proposal.md`]: "Greeting proposal",
    [`${dir}/design.md`]:
      "# Design\n\n## Greeting\nUse a text file.\n\n## Unrelated\nDO NOT INCLUDE THIS\n",
    [`${dir}/specs/greet/spec.md`]:
      "## ADDED Requirements\n\n### Requirement: Hello\nMust return hello.\n\n#### Scenario: Read\n- **WHEN** read\n- **THEN** hello\n\n### Requirement: Other\nUnrelated requirement.\n",
    [`${dir}/tasks.md`]:
      "## 1. Greeting\n\nDepends on: none\n\n- [ ] 1.1 [A] Write `tests/check.cjs`. Check: `node tests/check.cjs`\n  -> greet#Hello\n- [ ] 1.2 [A] Implement `src/message.txt`. Check: `node tests/check.cjs`\n  -> greet#Hello\n",
    [`${dir}/execution-plan.json`]: JSON.stringify({
      version: 1,
      cycles: [cycle],
    }),
    "src/message.txt": "old",
    "package.json": "{}",
    "tests/check.cjs":
      "const fs=require('fs'); if(fs.readFileSync('src/message.txt','utf8')!=='hello'){ console.error('EXPECTED hello'); process.exit(1); } console.log('PASS');",
  });
  made.push(ws);
  return ws.root;
}
afterEach(() => {
  made.splice(0).forEach((ws) => ws.remove());
  delete process.env.LEXFORGE_TEST_ENV;
});
export async function call(root: string, args: string[]) {
  const c = createCapture();
  const exitCode = await run([...args, "--change", "demo", "--json"], {
    cwd: root,
    stdout: c.stdout,
    stderr: c.stderr,
  });
  return { exitCode, data: c.out ? JSON.parse(c.out) : undefined, err: c.err };
}
export async function start(root: string) {
  expect(
    (await call(root, ["workflow", "migrate", "--to", "2"])).exitCode,
  ).toBe(0);
  expect(
    (
      await call(root, [
        "cycle",
        "start",
        "--cycle",
        "greeting",
        "--executor",
        "worker",
      ])
    ).exitCode,
  ).toBe(0);
}
export async function green(root: string) {
  expect(
    (
      await call(root, [
        "cycle",
        "run",
        "--cycle",
        "greeting",
        "--phase",
        "red",
      ])
    ).exitCode,
  ).toBe(0);
  writeAt(root, "src/message.txt", "hello");
  expect(
    (
      await call(root, [
        "cycle",
        "run",
        "--cycle",
        "greeting",
        "--phase",
        "green",
      ])
    ).exitCode,
  ).toBe(0);
}
export function review(root: string, overrides = {}) {
  writeAt(
    root,
    `${dir}/review.json`,
    JSON.stringify({
      reviewer: "independent",
      verdict: "approved",
      acceptance: ["AC1"],
      controls: [],
      findings: [],
      ...overrides,
    }),
  );
  return [
    "cycle",
    "review",
    "--cycle",
    "greeting",
    "--file",
    `${dir}/review.json`,
  ];
}
