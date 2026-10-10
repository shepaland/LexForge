import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { writeAt } from "../helpers/git-workspace.js";
import {
  call,
  cycle,
  dir,
  fixture,
  green,
  review,
  start,
} from "../helpers/execution-workspace.js";

import type { UsageError } from "../../src/cli/errors.js";
import { executionPlan } from "../../src/core/execution/plan.js";
import { checkFinalScope, checkStartScope } from "../../src/core/execution/scope.js";
import { worktreeDigest } from "../../src/core/git/worktree-digest.js";

const OUTSIDE = "scripts/tmp.sh";
const REFUSES = "\nAn edit outside the plan still refuses the cycle\n";
const run = ["cycle", "run", "--cycle", "greeting", "--phase", "green"];

it("lets an outside edit pass the GREEN run, the review and the close", async () => {
  const root = fixture();
  await start(root);
  expect(
    (await call(root, ["cycle", "run", "--cycle", "greeting", "--phase", "red"]))
      .exitCode,
  ).toBe(0);
  writeAt(root, "src/message.txt", "hello");
  writeAt(root, OUTSIDE, "echo parallel writer");
  expect((await call(root, run)).exitCode, REFUSES).toBe(0);
  expect((await call(root, review(root))).exitCode, REFUSES).toBe(0);
  writeAt(root, "scripts/second.sh", "echo another writer");
  const ctx = (await call(root, ["context", "--task", "1.1"])).data;
  expect(ctx.valid_evidence.length, REFUSES).toBeGreaterThan(0);
  expect(
    (await call(root, ["cycle", "close", "--cycle", "greeting"])).exitCode,
    REFUSES,
  ).toBe(0);
});

it("lets an outside edit made before cycle start through", async () => {
  const root = fixture();
  expect(
    (await call(root, ["workflow", "migrate", "--to", "2"])).exitCode,
  ).toBe(0);
  writeAt(root, OUTSIDE, "echo early");
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
    REFUSES,
  ).toBe(0);
  await green(root);
  expect((await call(root, review(root))).exitCode).toBe(0);
  expect(
    (await call(root, ["cycle", "close", "--cycle", "greeting"])).exitCode,
  ).toBe(0);
  const verify = await call(root, ["verify"]);
  const messages = verify.data.findings.map((f: { message: string }) => f.message);
  expect(
    messages.some((m: string) => m.includes(OUTSIDE)),
    JSON.stringify(messages),
  ).toBe(true);
});

it("lists the outside path at verify and names a next step", async () => {
  const root = fixture();
  await start(root);
  await green(root);
  expect((await call(root, review(root))).exitCode).toBe(0);
  expect(
    (await call(root, ["cycle", "close", "--cycle", "greeting"])).exitCode,
  ).toBe(0);
  writeAt(root, OUTSIDE, "echo left behind");
  const verify = await call(root, ["verify"]);
  expect(verify.exitCode).toBe(1);
  const messages = verify.data.findings.map((f: { message: string }) => f.message);
  expect(
    messages.some((m: string) => m.includes(OUTSIDE)),
    JSON.stringify(messages),
  ).toBe(true);
  expect(verify.data.nextStep).toBe(
    "revert these edits, or add a task that owns them, then run lexforge verify --change demo",
  );
});

const planned = (root: string) =>
  executionPlan(root, "demo", true).flatMap((c) => c.files.map((f) => f.path));
const baselineFile = (root: string) =>
  path.join(root, dir, "execution/baseline.json");

it("reports nothing for a baseline without a record while its digest matches", async () => {
  const root = fixture();
  await start(root);
  writeAt(root, OUTSIDE, "echo already there");
  const file = baselineFile(root);
  const baseline = JSON.parse(readFileSync(file, "utf8"));
  delete baseline.outside;
  baseline.outsideDigest = worktreeDigest(root, planned(root));
  writeFileSync(file, JSON.stringify(baseline));
  const cycles = executionPlan(root, "demo", true);
  expect(checkFinalScope(root, "demo", cycles)).toEqual([]);
  baseline.outsideDigest = "sha256:other";
  writeFileSync(file, JSON.stringify(baseline));
  expect(checkFinalScope(root, "demo", cycles)).toEqual([OUTSIDE]);
});

it("lists the outside path at verify before any cycle has started", async () => {
  const root = fixture();
  expect(
    (await call(root, ["workflow", "migrate", "--to", "2"])).exitCode,
  ).toBe(0);
  writeAt(root, OUTSIDE, "echo before the baseline");
  const verify = await call(root, ["verify"]);
  const messages = verify.data.findings.map((f: { message: string }) => f.message);
  expect(
    messages.some((m: string) => m.includes(OUTSIDE)),
    JSON.stringify(messages),
  ).toBe(true);
});

it("names every unstarted cycle path and a next step when a run is refused", async () => {
  const root = fixture();
  const second = {
    ...cycle,
    id: "second",
    tasks: ["2.1"],
    files: [
      { path: "src/second.txt", symbols: [] },
      { path: "tests/second.cjs", symbols: [] },
    ],
    testFiles: ["tests/second.cjs"],
    acceptance: [{ id: "AC2", task: "2.1", description: "second" }],
  };
  writeAt(
    root,
    `${dir}/execution-plan.json`,
    JSON.stringify({ version: 1, cycles: [cycle, second] }),
  );
  writeAt(
    root,
    `${dir}/tasks.md`,
    readFileSync(path.join(root, dir, "tasks.md"), "utf8") +
      "\n## 2. Independent\n\nDepends on: none\n\n- [ ] 2.1 [B] Write `src/second.txt` and `tests/second.cjs`. Check: `node tests/second.cjs`\n  -> greet#Other\n",
  );
  writeAt(root, "src/second.txt", "old");
  writeAt(root, "tests/second.cjs", "// second");
  await start(root);
  writeAt(root, "src/second.txt", "edited");
  writeAt(root, "tests/second.cjs", "// edited");
  const refused = await call(root, ["cycle", "run", "--cycle", "greeting", "--phase", "red"]);
  expect(refused.exitCode).toBe(2);
  expect(refused.data.error.message).toContain("src/second.txt");
  expect(refused.data.error.message).toContain("tests/second.cjs");
  expect(refused.data.nextStep).not.toBe("");
});

it("names every edited path and a next step when a start is refused", async () => {
  const root = fixture();
  await start(root);
  writeAt(root, "src/message.txt", "edited");
  writeAt(root, "tests/check.cjs", "// edited");
  let error: UsageError | undefined;
  try {
    checkStartScope(root, "demo", cycle, executionPlan(root, "demo", true), false);
  } catch (caught) {
    error = caught as UsageError;
  }
  expect(error?.message).toContain("src/message.txt");
  expect(error?.message).toContain("tests/check.cjs");
  expect(error?.nextStep).not.toBe("");
});
