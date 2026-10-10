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
      `const fs=require('fs'); if(fs.readFileSync('src/${n}.txt','utf8')!=='hello'){ console.error('EXPECTED hello'); process.exit(1); } console.log('PASS');`,
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
const NOT_YET = "A wave review is not implemented";
async function drive(root: string, ids: string[], skipGreen: string[] = []) {
  const name = (id: string) => id.replace("ingest-", "");
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
  for (const id of ids.filter((id) => !skipGreen.includes(id)))
    await ok(root, ["cycle", "run", "--cycle", id, "--phase", "green"]);
}
async function migrate(root: string) {
  await ok(root, ["workflow", "migrate", "--to", "2"]);
}
function report(root: string, overrides = {}) {
  writeAt(
    root,
    `${dir}/wave-1.json`,
    JSON.stringify({
      reviewer: "independent",
      verdict: "approved",
      acceptance: ["SCH1", "API1"],
      controls: [],
      findings: [],
      ...overrides,
    }),
  );
  return ["cycle", "review", "--wave", "1", "--file", `${dir}/wave-1.json`];
}
const close = (root: string, id: string) =>
  call(root, ["cycle", "close", "--cycle", id]);

it("registers one wave report, closes the covered cycles and keeps the controlled one open", async () => {
  const root = waveFixture();
  await migrate(root);
  await drive(root, ids);
  await ok(root, report(root), NOT_YET);
  await ok(root, ["cycle", "close", "--cycle", "ingest-schema"]);
  await ok(root, ["cycle", "close", "--cycle", "ingest-api"]);
  expect((await close(root, "ingest-auth")).exitCode).toBe(2);
  writeAt(
    root,
    `${dir}/auth.json`,
    JSON.stringify({
      reviewer: "security",
      verdict: "approved",
      acceptance: ["AUTH1"],
      controls: ["authorization"],
      findings: [],
    }),
  );
  await ok(root, [
    "cycle",
    "review",
    "--cycle",
    "ingest-auth",
    "--file",
    `${dir}/auth.json`,
  ]);
  await ok(root, ["cycle", "close", "--cycle", "ingest-auth"]);
}, 60000);

it("refuses the wave and names the cycle that lacks GREEN", async () => {
  const root = waveFixture();
  await migrate(root);
  await drive(root, ids, ["ingest-schema"]);
  const refused = await call(root, report(root));
  expect(refused.exitCode).toBe(2);
  expect(refused.data.error.message).toContain("ingest-schema");
}, 60000);

it("names the cycle and the acceptance ID missing from the report", async () => {
  const root = waveFixture();
  await migrate(root);
  await drive(root, ids);
  const refused = await call(root, report(root, { acceptance: ["SCH1"] }));
  expect(refused.exitCode).toBe(2);
  expect(refused.data.error.message).toContain("ingest-api");
  expect(refused.data.error.message).toContain("API1");
}, 60000);

it("names the cycle whose executor wrote the review", async () => {
  const root = waveFixture();
  await migrate(root);
  await drive(root, ids);
  const refused = await call(root, report(root, { reviewer: "worker-api" }));
  expect(refused.exitCode).toBe(2);
  expect(refused.data.error.message).toContain("ingest-api");
}, 60000);

it("lets a finding on one cycle block only that cycle", async () => {
  const root = waveFixture();
  await migrate(root);
  await drive(root, ids);
  await ok(
    root,
    report(root, {
      findings: [
        {
          id: "F1",
          level: "important",
          message: "api leaks",
          resolved: false,
          cycle: "ingest-api",
        },
      ],
    }),
    NOT_YET,
  );
  await ok(root, ["cycle", "close", "--cycle", "ingest-schema"]);
  expect((await close(root, "ingest-api")).exitCode).toBe(2);
}, 60000);

const finding = (extra = {}) => ({
  id: "F9",
  level: "important",
  message: "problem",
  resolved: false,
  ...extra,
});

it("refuses a wave finding that names a cycle outside the covered set", async () => {
  const root = waveFixture();
  await migrate(root);
  await drive(root, ids);
  for (const cycle of ["ingest-apii", "ingest-auth"]) {
    const refused = await call(
      root,
      report(root, { findings: [finding({ cycle })] }),
    );
    expect(refused.exitCode).toBe(2);
    expect(refused.data.error.message).toContain("F9");
    expect(refused.data.error.message).toContain(cycle);
  }
}, 60000);

it("refuses a single-cycle finding that names another cycle", async () => {
  const root = waveFixture();
  await migrate(root);
  await drive(root, ids);
  writeAt(
    root,
    `${dir}/auth.json`,
    JSON.stringify({
      reviewer: "security",
      verdict: "approved",
      acceptance: ["AUTH1"],
      controls: ["authorization"],
      findings: [finding({ cycle: "ingest-api" })],
    }),
  );
  const refused = await call(root, [
    "cycle",
    "review",
    "--cycle",
    "ingest-auth",
    "--file",
    `${dir}/auth.json`,
  ]);
  expect(refused.exitCode).toBe(2);
  expect(refused.data.error.message).toContain("F9");
}, 60000);

it("refuses a wave whose covered cycles are all closed", async () => {
  const root = waveFixture();
  await migrate(root);
  await drive(root, ids);
  await ok(root, report(root), NOT_YET);
  await ok(root, ["cycle", "close", "--cycle", "ingest-schema"]);
  await ok(root, ["cycle", "close", "--cycle", "ingest-api"]);
  const refused = await call(root, report(root));
  expect(refused.exitCode).toBe(2);
  expect(refused.data.error.message).toContain("closed");
}, 60000);

it("lets a finding without a cycle block every covered cycle", async () => {
  const root = waveFixture();
  await migrate(root);
  await drive(root, ids);
  await ok(root, report(root, { findings: [finding()] }), NOT_YET);
  expect((await close(root, "ingest-schema")).exitCode).toBe(2);
  expect((await close(root, "ingest-api")).exitCode).toBe(2);
}, 60000);

it("tells how to refresh a stale GREEN", async () => {
  const root = waveFixture();
  await migrate(root);
  await drive(root, ids, ["ingest-schema"]);
  const refused = await call(root, report(root));
  expect(refused.exitCode).toBe(2);
  expect(refused.data.nextStep).toContain("--phase green");
}, 60000);
