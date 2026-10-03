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

it("final cycle gate rejects unreviewed changes after closure", async () => {
  const root = fixture();
  await start(root);
  await green(root);
  expect((await call(root, review(root))).exitCode).toBe(0);
  expect(
    (await call(root, ["cycle", "close", "--cycle", "greeting"])).exitCode,
  ).toBe(0);
  writeAt(root, "src/message.txt", "unreviewed");
  const { cycleProblems } = await import("../../src/core/execution/context.js");
  expect(cycleProblems(root, "demo").join(" ")).toContain("src/message.txt");
});
it("restart retains the original unreviewed baseline", async () => {
  const root = fixture();
  await start(root);
  await green(root);
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
  const state = JSON.parse(
    readFileSync(path.join(root, dir, "execution/greeting/state.json"), "utf8"),
  );
  expect(
    readFileSync(path.join(root, state.before, "src/message.txt"), "utf8"),
  ).toBe("old");
});
it("honours section dependencies when mapping cycles", async () => {
  const root = fixture();
  writeAt(
    root,
    `${dir}/tasks.md`,
    "## 1. Tests\n\nDepends on: none\n\n- [ ] 1.1 [A] Write `tests/check.cjs`. Check: `node tests/check.cjs`\n  -> greet#Hello\n\n## 2. Implementation\n\nDepends on: 1\n\n- [ ] 1.2 [A] Implement `src/message.txt`. Check: `node tests/check.cjs`\n  -> greet#Hello\n",
  );
  expect(
    (await call(root, ["workflow", "migrate", "--to", "2"])).exitCode,
  ).toBe(2);
});
it("extracts split plans and refuses missing requirement sources", async () => {
  const root = fixture();
  const plan = readFileSync(path.join(root, dir, "tasks.md"), "utf8");
  writeAt(root, `${dir}/tasks.md`, "## 1. Greeting\n\n`tasks/one.md`\n");
  writeAt(root, `${dir}/tasks/one.md`, plan.replace("## 1. Greeting\n\n", ""));
  expect(
    (await call(root, ["context", "--task", "1.2"])).data.tasks[1].path,
  ).toBe(`${dir}/tasks/one.md`);
  writeAt(
    root,
    `${dir}/specs/greet/spec.md`,
    "### Requirement: Different\nOther.",
  );
  expect((await call(root, ["context", "--task", "1.2"])).exitCode).toBe(2);
});
it("does not silently upgrade an unsupported workflow pin", async () => {
  const root = fixture();
  writeAt(
    root,
    `${dir}/workflow.json`,
    JSON.stringify({ version: 99, schema: "spec-driven", schemaVersion: 1 }),
  );
  expect((await call(root, ["context", "--task", "1.2"])).exitCode).toBe(2);
});
it("invalidates tampered logs and blocks unscoped changes", async () => {
  const root = fixture();
  await start(root);
  await green(root);
  const ctx = (await call(root, ["context", "--task", "1.2"])).data;
  writeAt(root, ctx.valid_evidence[1].log, "tampered");
  expect((await call(root, review(root))).exitCode).toBe(2);
  writeAt(root, "unscoped.txt", "change");
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
it("rejects noncanonical paths before scope comparisons", async () => {
  const root = fixture();
  writeAt(
    root,
    `${dir}/execution-plan.json`,
    JSON.stringify({
      version: 1,
      cycles: [
        {
          ...cycle,
          files: [...cycle.files, { path: "./lexforge/hidden", symbols: [] }],
        },
      ],
    }),
  );
  expect(
    (await call(root, ["workflow", "migrate", "--to", "2"])).exitCode,
  ).toBe(2);
});
it.each(["/etc/nginx/conf.d", "../outside.ts", "C:/temp/routes.ts", "src\\routes.ts"])(
  "keeps the strict cycle path boundary for %s",
  async (unsafePath) => {
    const root = fixture();
    writeAt(
      root,
      `${dir}/execution-plan.json`,
      JSON.stringify({
        version: 1,
        cycles: [{ ...cycle, files: [...cycle.files, { path: unsafePath, symbols: [] }] }],
      }),
    );

    const result = await call(root, ["workflow", "migrate", "--to", "2"]);
    expect(result.exitCode).toBe(2);
  },
);
it("rejects a GREEN command that mutates ignored output after testing it", async () => {
  const root = fixture();
  const { git } = await import("../helpers/git-workspace.js");
  writeAt(root, ".gitignore", "src/message.txt\n");
  git(root, "rm", "--cached", "src/message.txt");
  git(root, "add", ".gitignore");
  git(root, "commit", "-m", "ignore generated source");
  writeAt(
    root,
    "tests/check.cjs",
    "const fs=require('fs');if(fs.readFileSync('src/message.txt','utf8')!=='hello'){console.error('EXPECTED hello');process.exit(1)}fs.writeFileSync('src/message.txt','untested');",
  );
  await start(root);
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
  ).toBe(1);
});
it("preserves continuity and historical proof across sequential cycles on the same files", async () => {
  const root = fixture();
  const second = {
    ...cycle,
    id: "farewell",
    tasks: ["2.1"],
    dependsOn: ["greeting"],
    expectedFailure: "EXPECTED bye",
    acceptance: [{ id: "AC2", task: "2.1", description: "returns bye" }],
  };
  writeAt(
    root,
    `${dir}/execution-plan.json`,
    JSON.stringify({ version: 1, cycles: [cycle, second] }),
  );
  const original = readFileSync(path.join(root, dir, "tasks.md"), "utf8");
  writeAt(
    root,
    `${dir}/tasks.md`,
    original +
      "\n## 2. Farewell\n\nDepends on: 1\n\n- [ ] 2.1 [B] Change `src/message.txt` and `tests/check.cjs`. Check: `node tests/check.cjs`\n  -> greet#Hello\n",
  );
  await start(root);
  await green(root);
  expect((await call(root, review(root))).exitCode).toBe(0);
  expect(
    (await call(root, ["cycle", "close", "--cycle", "greeting"])).exitCode,
  ).toBe(0);
  writeAt(root, "src/message.txt", "unreviewed");
  expect(
    (
      await call(root, [
        "cycle",
        "start",
        "--cycle",
        "farewell",
        "--executor",
        "worker",
      ])
    ).exitCode,
  ).toBe(2);
  writeAt(root, "src/message.txt", "hello");
  expect(
    (
      await call(root, [
        "cycle",
        "start",
        "--cycle",
        "farewell",
        "--executor",
        "worker",
      ])
    ).exitCode,
  ).toBe(0);
  writeAt(
    root,
    "tests/check.cjs",
    "const fs=require('fs');if(fs.readFileSync('src/message.txt','utf8')!=='bye'){console.error('EXPECTED bye');process.exit(1)}",
  );
  expect(
    (
      await call(root, [
        "cycle",
        "run",
        "--cycle",
        "farewell",
        "--phase",
        "red",
      ])
    ).exitCode,
  ).toBe(0);
  writeAt(root, "src/message.txt", "bye");
  expect(
    (
      await call(root, [
        "cycle",
        "run",
        "--cycle",
        "farewell",
        "--phase",
        "green",
      ])
    ).exitCode,
  ).toBe(0);
  const args = review(root, { acceptance: ["AC2"] });
  args[3] = "farewell";
  expect((await call(root, args)).exitCode).toBe(0);
  expect(
    (await call(root, ["cycle", "close", "--cycle", "farewell"])).exitCode,
  ).toBe(0);
  const { cycleProblems } = await import("../../src/core/execution/context.js");
  expect(cycleProblems(root, "demo")).toEqual([]);
  const ctx = (await call(root, ["context", "--task", "2.1"])).data;
  const patch = readFileSync(path.join(root, ctx.review_patch), "utf8");
  expect(patch).toContain("-hello");
  expect(patch).not.toContain("-old");
});
it("ignores fenced task and heading examples without truncating requirement bodies", async () => {
  const root = fixture();
  const old = readFileSync(path.join(root, dir, "tasks.md"), "utf8");
  writeAt(
    root,
    `${dir}/tasks.md`,
    old + "\n```md\n## 99. Example\n- [ ] 99.1 fake task\n```\n",
  );
  writeAt(
    root,
    `${dir}/specs/greet/spec.md`,
    "### Requirement: Hello\nMust return hello.\n```md\n### Requirement: Example\n```\nRequired after the example.\n",
  );
  const result = await call(root, ["context", "--task", "1.2"]);
  expect(result.exitCode).toBe(0);
  expect(result.data.requirements[0].text).toContain(
    "Required after the example",
  );
});
it("restart refuses to absorb edits from a newly declared path with no proven baseline", async () => {
  const root = fixture();
  await start(root);
  writeAt(root, "src/extra.txt", "unreviewed");
  const expanded = {
    ...cycle,
    files: [...cycle.files, { path: "src/extra.txt", symbols: [] }],
  };
  writeAt(
    root,
    `${dir}/execution-plan.json`,
    JSON.stringify({ version: 1, cycles: [expanded] }),
  );
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
  ).toBe(2);
});
it("preserves the explicit pure-move exemption without waiving GREEN or review", async () => {
  const root = fixture();
  const tasks = readFileSync(
    path.join(root, dir, "tasks.md"),
    "utf8",
  ).replaceAll("[A]", "[A] (move)");
  writeAt(root, `${dir}/tasks.md`, tasks);
  writeAt(
    root,
    `${dir}/execution-plan.json`,
    JSON.stringify({ version: 1, cycles: [{ ...cycle, mode: "move" }] }),
  );
  writeAt(root, "src/message.txt", "hello");
  await start(root);
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
  expect(
    (await call(root, ["cycle", "close", "--cycle", "greeting"])).exitCode,
  ).toBe(2);
  expect((await call(root, review(root))).exitCode).toBe(0);
  expect(
    (await call(root, ["cycle", "close", "--cycle", "greeting"])).exitCode,
  ).toBe(0);
});
