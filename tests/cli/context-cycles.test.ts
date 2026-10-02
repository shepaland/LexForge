import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { writeAt } from "../helpers/git-workspace.js";
import {
  dir,
  cycle,
  fixture,
  call,
  start,
  green,
  review,
} from "../helpers/execution-workspace.js";

it("builds narrow context with exact requirements and decisions, and refuses silent truncation", async () => {
  const root = fixture();
  const r = await call(root, ["context", "--task", "1.2"]);
  expect(r.exitCode).toBe(0);
  expect(r.data.task_id).toBe("1.2");
  expect(r.data.tasks.map((t: any) => t.id)).toEqual(["1.1", "1.2"]);
  expect(JSON.stringify(r.data)).toContain("Must return hello");
  expect(JSON.stringify(r.data)).not.toContain("DO NOT INCLUDE THIS");
  expect(r.data.workflow.version).toBe(1);
  expect(
    (await call(root, ["context", "--task", "1.2", "--max-bytes", "10"]))
      .exitCode,
  ).toBe(2);
});
it("migrates explicitly without rewriting original tasks and evidence", async () => {
  const root = fixture();
  const before = readFileSync(path.join(root, dir, "tasks.md"), "utf8");
  expect(
    (await call(root, ["workflow", "migrate", "--to", "2"])).exitCode,
  ).toBe(0);
  expect(readFileSync(path.join(root, dir, "tasks.md"), "utf8")).toBe(before);
  expect(
    (await call(root, ["context", "--task", "1.2"])).data.workflow.version,
  ).toBe(2);
});
it("records one RED/GREEN cycle, requires independent complete review, and saves resume", async () => {
  const root = fixture();
  await start(root);
  expect(
    (await call(root, ["cycle", "close", "--cycle", "greeting"])).exitCode,
  ).not.toBe(0);
  await green(root);
  expect(
    (await call(root, review(root, { reviewer: "worker" }))).exitCode,
  ).toBe(2);
  expect((await call(root, review(root, { acceptance: [] }))).exitCode).toBe(2);
  expect((await call(root, review(root))).exitCode).toBe(0);
  expect(
    (await call(root, ["cycle", "close", "--cycle", "greeting"])).exitCode,
  ).toBe(0);
  const resume = await call(root, ["resume"]);
  expect(resume.data.completed_tasks).toEqual(["1.1", "1.2"]);
  expect(existsSync(path.join(root, dir, "continuation.json"))).toBe(true);
  const context = (await call(root, ["context", "--task", "1.2"])).data;
  expect(context.valid_evidence.length).toBeGreaterThan(0);
});
it("rejects arbitrary failure and changed tests or material environment before GREEN", async () => {
  const root = fixture();
  await start(root);
  writeAt(
    root,
    "tests/check.cjs",
    "console.error('build failed');process.exit(1)",
  );
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
  ).toBe(1);
  writeAt(
    root,
    "tests/check.cjs",
    "console.error('EXPECTED hello');process.exit(1)",
  );
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
  process.env.LEXFORGE_TEST_ENV = "changed";
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
  ).toBe(2);
});
it("invalidates current evidence and review after source edits", async () => {
  const root = fixture();
  await start(root);
  await green(root);
  expect((await call(root, review(root))).exitCode).toBe(0);
  writeAt(root, "src/message.txt", "changed");
  expect(
    (await call(root, ["cycle", "close", "--cycle", "greeting"])).exitCode,
  ).toBe(2);
  expect(
    (await call(root, ["context", "--task", "1.2"])).data.valid_evidence,
  ).toEqual([]);
});
it("saves complete logs but returns bounded output and cycle-local patch", async () => {
  const root = fixture();
  writeAt(root, "src/message.txt", "prior uncommitted");
  await start(root);
  await green(root);
  const r = (await call(root, ["context", "--task", "1.2"])).data;
  const record = r.valid_evidence.find((e: any) => e.phase === "green");
  expect(readFileSync(path.join(root, record.log), "utf8")).toContain("PASS");
  const patch = readFileSync(path.join(root, r.review_patch), "utf8");
  expect(patch).toContain("-prior uncommitted");
  expect(patch).toContain("+hello");
});
it("refuses missing production scope and original section dependencies", async () => {
  const root = fixture();
  writeAt(
    root,
    `${dir}/execution-plan.json`,
    JSON.stringify({
      version: 1,
      cycles: [{ ...cycle, files: [cycle.files[1]] }],
    }),
  );
  expect(
    (await call(root, ["workflow", "migrate", "--to", "2"])).exitCode,
  ).toBe(2);
});
it("does not treat a source line quoted by SyntaxError as the expected assertion", async () => {
  const root = fixture();
  await start(root);
  writeAt(root, "tests/check.cjs", "console.error('EXPECTED hello'\n");
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
  ).toBe(1);
});
it("blocks cycle execution until planning is complete", async () => {
  const root = fixture();
  writeAt(root, `${dir}/proposal.md`, "");
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
  ).toBe(2);
});
it("explicit restart preserves history and task IDs after contract changes", async () => {
  const root = fixture();
  await start(root);
  await green(root);
  writeAt(root, `${dir}/design.md`, "## Greeting\nUse another format.\n");
  expect(
    (
      await call(root, [
        "cycle",
        "restart",
        "--cycle",
        "greeting",
        "--executor",
        "worker",
      ])
    ).exitCode,
  ).toBe(0);
  expect(
    (await call(root, ["context", "--task", "1.2"])).data.valid_evidence,
  ).toEqual([]);
});
