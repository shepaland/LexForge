import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { commitAll, writeAt } from "../helpers/git-workspace.js";
import { call, dir, fixture } from "../helpers/execution-workspace.js";

const SHARED = "tests/pack.cjs";
const acceptance: Record<string, string> = {
  "pack-a": "PA1",
  "pack-b": "PB1",
  "pack-c": "PC1",
};

function cycleOf(
  id: string,
  tasks: string[],
  shared: boolean,
  dependsOn: string[] = [],
) {
  const key = id.replace("pack-", "");
  return {
    id,
    tasks,
    dependsOn,
    files: [
      { path: `src/${key}.txt`, symbols: [] },
      { path: `tests/${key}.cjs`, symbols: [] },
      ...(shared ? [{ path: SHARED, symbols: [] }] : []),
    ],
    testFiles: [`tests/${key}.cjs`],
    inputs: ["package.json"],
    environment: [],
    command: `node tests/${key}.cjs`,
    expectedFailure: "EXPECTED hello",
    design: [{ path: `${dir}/design.md`, heading: "Greeting" }],
    acceptance: [
      { id: acceptance[id], task: tasks[1], description: "returns hello" },
    ],
    controls: [],
  };
}

function section(n: number, depends: string, keys: string[]) {
  const body = keys
    .map((k, i) => {
      const a = i * 2 + 1;
      return (
        `- [ ] ${n}.${a} [A] Write \`tests/${k}.cjs\`. Check: \`node tests/${k}.cjs\`\n  -> greet#Hello\n` +
        `- [ ] ${n}.${a + 1} [A] Implement \`src/${k}.txt\`. Check: \`node tests/${k}.cjs\`\n  -> greet#Hello\n`
      );
    })
    .join("");
  return `## ${n}. Pack ${n}\n\nDepends on: ${depends}\n\n${body}`;
}

function packFixture(aListsShared: boolean) {
  const root = fixture();
  writeAt(
    root,
    `${dir}/tasks.md`,
    `${section(1, "none", ["a", "b"])}\n${section(2, "1", ["c"])}`,
  );
  writeAt(
    root,
    `${dir}/execution-plan.json`,
    JSON.stringify({
      version: 1,
      cycles: [
        cycleOf("pack-a", ["1.1", "1.2"], aListsShared),
        cycleOf("pack-b", ["1.3", "1.4"], false),
        cycleOf("pack-c", ["2.1", "2.2"], true, ["pack-a", "pack-b"]),
      ],
    }),
  );
  for (const k of ["a", "b", "c"]) {
    writeAt(root, `src/${k}.txt`, "old");
    writeAt(
      root,
      `tests/${k}.cjs`,
      `const fs=require('fs'); if(fs.readFileSync('src/${k}.txt','utf8')!=='hello'){ console.error('EXPECTED hello'); process.exit(1); } console.log('PASS');`,
    );
  }
  writeAt(root, SHARED, "// shared v1\n");
  commitAll(root, "pack fixture");
  return root;
}
// The marker sits on a line of its own so the cycle RED can match it.
const refusal = (r: { data?: any; err?: string }) =>
  `\n${(r.data?.error?.message ?? r.err ?? JSON.stringify(r.data)).replace(/^(Unstarted cycle files changed): /, "$1\n")}\n`;
async function ok(root: string, args: string[]) {
  const r = await call(root, args);
  expect(r.exitCode, refusal(r)).toBe(0);
  return r;
}
async function startBoth(root: string) {
  await ok(root, ["workflow", "migrate", "--to", "2"]);
  for (const k of ["a", "b"]) {
    const id = `pack-${k}`;
    await ok(root, ["cycle", "start", "--cycle", id, "--executor", `w-${k}`]);
    await ok(root, ["cycle", "run", "--cycle", id, "--phase", "red"]);
  }
}
const green = (root: string, id: string) =>
  call(root, ["cycle", "run", "--cycle", id, "--phase", "green"]);

it("lets a sibling take GREEN and the wave register when a started cycle edits a file an unstarted one lists", async () => {
  const root = packFixture(true);
  await startBoth(root);
  writeAt(root, "src/a.txt", "hello");
  writeAt(root, "src/b.txt", "hello");
  writeAt(root, SHARED, "// shared v2\n");
  await ok(root, ["cycle", "run", "--cycle", "pack-a", "--phase", "green"]);
  const original = readFileSync(path.join(root, "tests/c.cjs"), "utf8");
  writeAt(root, "tests/c.cjs", `${original}// edited\n`);
  const refused = await green(root, "pack-b");
  expect(refused.exitCode).toBe(2);
  expect(refused.data.error.message).toContain("pack-c: tests/c.cjs");
  expect(refused.data.error.message, refusal(refused)).not.toContain(SHARED);
  writeAt(root, "tests/c.cjs", original);
  const b = await green(root, "pack-b");
  expect(b.exitCode, refusal(b)).toBe(0);
  writeAt(
    root,
    `${dir}/wave-1.json`,
    JSON.stringify({
      reviewer: "independent",
      verdict: "approved",
      acceptance: ["PA1", "PB1"],
      controls: [],
      findings: [],
    }),
  );
  await ok(root, [
    "cycle",
    "review",
    "--wave",
    "1",
    "--file",
    `${dir}/wave-1.json`,
  ]);
}, 60000);

it("refuses the run when only an unstarted cycle lists the changed file", async () => {
  const root = packFixture(false);
  await startBoth(root);
  writeAt(root, "src/a.txt", "hello");
  writeAt(root, "src/b.txt", "hello");
  writeAt(root, SHARED, "// shared v2\n");
  const refused = await green(root, "pack-b");
  expect(refused.exitCode).toBe(2);
  expect(refused.data.error.message).toContain(SHARED);
}, 60000);
