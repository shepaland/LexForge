import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { commitAll, writeAt } from "../helpers/git-workspace.js";
import { call, dir, fixture } from "../helpers/execution-workspace.js";

const names = ["schema", "api", "auth"] as const;
const ids = names.map((n) => `ingest-${n}`);
const acceptance: Record<string, string> = {
  "ingest-schema": "SCH1",
  "ingest-api": "API1",
  "ingest-auth": "AUTH1",
};

function waveFixture() {
  const root = fixture();
  const tasks = names
    .map((n, i) => {
      const a = i * 2 + 1;
      return `- [ ] 1.${a} [A] Write \`tests/${n}.cjs\`. Check: \`node tests/${n}.cjs\`\n  -> greet#Hello\n- [ ] 1.${a + 1} [A] Implement \`src/${n}.txt\`. Check: \`node tests/${n}.cjs\`\n  -> greet#Hello\n`;
    })
    .join("");
  writeAt(
    root,
    `${dir}/tasks.md`,
    `## 1. Ingest\n\nDepends on: none\n\n${tasks}`,
  );
  writeAt(
    root,
    `${dir}/execution-plan.json`,
    JSON.stringify({
      version: 1,
      cycles: names.map((n, i) => ({
        id: `ingest-${n}`,
        tasks: [`1.${i * 2 + 1}`, `1.${i * 2 + 2}`],
        dependsOn: [],
        files: [
          { path: `src/${n}.txt`, symbols: [] },
          { path: `tests/${n}.cjs`, symbols: [] },
        ],
        testFiles: [`tests/${n}.cjs`],
        inputs: ["package.json"],
        environment: [],
        command: `node tests/${n}.cjs`,
        expectedFailure: "EXPECTED hello",
        design: [{ path: `${dir}/design.md`, heading: "Greeting" }],
        acceptance: [
          {
            id: acceptance[`ingest-${n}`],
            task: `1.${i * 2 + 2}`,
            description: "returns hello",
          },
        ],
        controls: n === "auth" ? ["authorization"] : [],
      })),
    }),
  );
  for (const n of names) {
    writeAt(root, `src/${n}.txt`, "old");
    writeAt(
      root,
      `tests/${n}.cjs`,
      `const fs=require('fs'); if(!fs.readFileSync('src/${n}.txt','utf8').startsWith('hello')){ console.error('EXPECTED hello'); process.exit(1); } console.log('PASS');`,
    );
  }
  commitAll(root, "ingest fixture");
  return root;
}
async function ok(root: string, args: string[], note = "") {
  const r = await call(root, args);
  expect(r.exitCode, `\n${note || r.err || JSON.stringify(r.data)}\n`).toBe(0);
  return r;
}
const name = (id: string) => id.replace("ingest-", "");
async function green(root: string, id: string) {
  await ok(root, ["cycle", "run", "--cycle", id, "--phase", "green"]);
}
async function drive(root: string) {
  await ok(root, ["workflow", "migrate", "--to", "2"]);
  for (const id of ids) {
    await ok(root, [
      "cycle",
      "start",
      "--cycle",
      id,
      "--executor",
      `worker-${name(id)}`,
    ]);
    await ok(root, ["cycle", "run", "--cycle", id, "--phase", "red"]);
  }
  for (const id of ids) writeAt(root, `src/${name(id)}.txt`, "hello");
  for (const id of ids) await green(root, id);
}
const NOT_YET = "A fixes review is not implemented";
/** A fixes report that must be accepted; the note names a missing fixes path only. */
async function okFixes(root: string, args: string[]) {
  const r = await call(root, args);
  const text = r.err || JSON.stringify(r.data);
  const missing = r.exitCode !== 0 && text.includes("misses acceptance");
  expect(r.exitCode, `\n${missing ? NOT_YET : text}\n`).toBe(0);
  return r;
}
function stateOf(root: string, id: string) {
  return JSON.parse(
    readFileSync(path.join(root, dir, "execution", id, "state.json"), "utf8"),
  );
}
const finding = (id: string, cycle: string, extra = {}) => ({
  id,
  level: "important",
  message: `problem ${id}`,
  resolved: false,
  cycle,
  ...extra,
});
function wave(root: string, file: string, overrides = {}) {
  writeAt(
    root,
    `${dir}/${file}`,
    JSON.stringify({
      reviewer: "independent",
      verdict: "approved",
      acceptance: ["SCH1", "API1"],
      controls: [],
      findings: [],
      ...overrides,
    }),
  );
  return ["cycle", "review", "--wave", "1", "--file", `${dir}/${file}`];
}
async function firstReport(root: string, findings: unknown[]) {
  const r = await ok(root, wave(root, "wave-1.json", { findings }));
  return (r.data.file ?? r.data.data?.file) as string;
}
async function fixRound(root: string) {
  writeAt(root, "src/schema.txt", "hello\n");
  writeAt(root, "src/api.txt", "hello\n");
  await green(root, "ingest-schema");
  await green(root, "ingest-api");
}
const twoFindings = [
  finding("F1", "ingest-schema"),
  finding("F2", "ingest-api"),
];
function fixes(root: string, previous: string, findings: unknown[]) {
  return wave(root, "fixes-1.json", {
    scope: "fixes",
    previous,
    acceptance: [],
    findings,
  });
}
const resolved = (id: string, cycle: string) =>
  finding(id, cycle, { resolved: true });

it("hands the reviewer a patch from the registered state to the current GREEN", async () => {
  const root = waveFixture();
  await drive(root);
  await firstReport(root, twoFindings);
  await fixRound(root);
  const ctx = (await call(root, ["context", "--task", "1.1"])).data;
  const patch = readFileSync(path.join(root, ctx.review_patch), "utf8");
  expect(patch).toContain("+hello");
  expect(patch).not.toContain("\n-old");
}, 90000);

it("accepts a fixes report that resolves every finding and lets the cycles close", async () => {
  const root = waveFixture();
  await drive(root);
  const previous = await firstReport(root, twoFindings);
  await fixRound(root);
  await okFixes(
    root,
    fixes(root, previous, [
      resolved("F1", "ingest-schema"),
      resolved("F2", "ingest-api"),
    ]),
  );
  await ok(root, ["cycle", "close", "--cycle", "ingest-schema"]);
  await ok(root, ["cycle", "close", "--cycle", "ingest-api"]);
}, 90000);

it("names the finding a fixes report leaves out", async () => {
  const root = waveFixture();
  await drive(root);
  const previous = await firstReport(root, twoFindings);
  await fixRound(root);
  const refused = await call(
    root,
    fixes(root, previous, [resolved("F1", "ingest-schema")]),
  );
  expect(refused.exitCode).toBe(2);
  expect(refused.data.error.message).toContain("F2");
  expect(refused.data.error.message).not.toContain("F1");
}, 90000);

it("refuses a fixes report when the earlier report has no blocking finding", async () => {
  const root = waveFixture();
  await drive(root);
  const previous = await firstReport(root, []);
  const refused = await call(root, fixes(root, previous, []));
  expect(refused.exitCode).toBe(2);
  expect(refused.data.error.message).toContain("blocking");
}, 90000);

it("refuses a wave finding that names an already closed cycle", async () => {
  const root = waveFixture();
  await drive(root);
  await firstReport(root, [finding("F1", "ingest-api")]);
  await ok(root, ["cycle", "close", "--cycle", "ingest-schema"]);
  const refused = await call(
    root,
    wave(root, "wave-2.json", { findings: [finding("F3", "ingest-schema")] }),
  );
  expect(refused.exitCode).toBe(2);
  expect(refused.data.error.message).toContain("F3");
  expect(refused.data.error.message).toContain("closed");
}, 90000);

it("gives a runnable command to refresh a stale GREEN", async () => {
  const root = waveFixture();
  await drive(root);
  writeAt(root, "src/schema.txt", "hello again");
  const refused = await call(root, wave(root, "wave-1.json"));
  expect(refused.exitCode).toBe(2);
  expect(refused.data.nextStep).toContain(
    "lexforge cycle run --change demo --cycle ingest-schema --phase green",
  );
}, 90000);

it("refuses a fixes report that names an older report than the registered one", async () => {
  const root = waveFixture();
  await drive(root);
  const a = await firstReport(root, [finding("F1", "ingest-schema")]);
  writeAt(root, "src/schema.txt", "hello\n");
  await green(root, "ingest-schema");
  await green(root, "ingest-api");
  await okFixes(
    root,
    wave(root, "fixes-b.json", {
      scope: "fixes",
      previous: a,
      acceptance: [],
      findings: [
        resolved("F1", "ingest-schema"),
        finding("F2", "ingest-schema"),
      ],
    }),
  );
  writeAt(root, "src/schema.txt", "hello\n\n");
  await green(root, "ingest-schema");
  await green(root, "ingest-api");
  const refused = await call(
    root,
    wave(root, "fixes-c.json", {
      scope: "fixes",
      previous: a,
      acceptance: [],
      findings: [resolved("F1", "ingest-schema")],
    }),
  );
  expect(refused.exitCode).toBe(2);
  expect(refused.data.error.message).toContain("registered");
  expect(
    (await call(root, ["cycle", "close", "--cycle", "ingest-schema"])).exitCode,
  ).not.toBe(0);
}, 90000);

it("refuses a fixes report when no fix round ran since the earlier report", async () => {
  const root = waveFixture();
  await drive(root);
  const previous = await firstReport(root, twoFindings);
  const refused = await call(
    root,
    fixes(root, previous, [
      resolved("F1", "ingest-schema"),
      resolved("F2", "ingest-api"),
    ]),
  );
  expect(refused.exitCode).toBe(2);
  expect(refused.data.error.message).toContain("fix round");
}, 90000);

it("registers the fixes report on a clean sibling so it can close", async () => {
  const root = waveFixture();
  await drive(root);
  const r = await ok(
    root,
    wave(root, "wave-1.json", {
      verdict: "changes-requested",
      findings: [finding("F1", "ingest-schema")],
    }),
  );
  const previous = (r.data.file ?? r.data.data?.file) as string;
  writeAt(root, "src/schema.txt", "hello\n");
  await green(root, "ingest-schema");
  await green(root, "ingest-api");
  await okFixes(root, fixes(root, previous, [resolved("F1", "ingest-schema")]));
  await ok(root, ["cycle", "close", "--cycle", "ingest-api"]);
  await ok(root, ["cycle", "close", "--cycle", "ingest-schema"]);
}, 90000);

it("keeps the original baseline in before and a restart drops the review base", async () => {
  const root = waveFixture();
  await drive(root);
  const previous = await firstReport(root, twoFindings);
  await fixRound(root);
  const original = stateOf(root, "ingest-schema");
  await okFixes(
    root,
    fixes(root, previous, [
      resolved("F1", "ingest-schema"),
      resolved("F2", "ingest-api"),
    ]),
  );
  const registered = stateOf(root, "ingest-schema");
  expect(registered.before).toBe(original.before);
  expect(registered.beforeHashes).toEqual(original.beforeHashes);
  expect(registered.reviewBase).toBeTruthy();
  expect(registered.reviewBase).not.toBe(registered.before);
  await ok(root, [
    "cycle",
    "restart",
    "--cycle",
    "ingest-schema",
    "--executor",
    "worker-again",
  ]);
  const restarted = stateOf(root, "ingest-schema");
  expect(restarted.reviewBase).toBeUndefined();
  expect(restarted.beforeHashes).toEqual(original.beforeHashes);
  expect(
    readFileSync(path.join(root, restarted.before, "src/schema.txt"), "utf8"),
  ).toBe("old");
}, 90000);

it("matches a resolved mark by finding id and cycle", async () => {
  const root = waveFixture();
  await drive(root);
  const previous = await firstReport(root, twoFindings);
  await fixRound(root);
  const refused = await call(
    root,
    fixes(root, previous, [
      resolved("F1", "ingest-schema"),
      resolved("F2", "ingest-schema"),
    ]),
  );
  expect(refused.exitCode).toBe(2);
  expect(refused.data.error.message).toContain("F2");
}, 90000);
