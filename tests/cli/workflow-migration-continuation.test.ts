import { afterEach, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  migrationFixture,
  addLegacyEvidence,
  callMigration,
  writeMigrationFile,
  MIGRATION_DIR,
} from "../helpers/migration-workspace.js";
import type { GitWorkspace } from "../helpers/git-workspace.js";
const made: GitWorkspace[] = [];
afterEach(() => made.splice(0).forEach((w) => w.remove()));
async function setup(mixed = false) {
  const w = migrationFixture([
    { id: "1.1", checked: true },
    { id: "1.2", checked: false },
  ]);
  made.push(w);
  const plan = JSON.parse(
    readFileSync(
      path.join(w.root, MIGRATION_DIR, "execution-plan.json"),
      "utf8",
    ),
  );
  if (mixed) {
    plan.cycles[0].tasks.push("1.2");
    plan.cycles[0].acceptance.push(...plan.cycles[1].acceptance);
    plan.cycles.pop();
  } else plan.cycles[1].dependsOn = ["cycle-1"];
  writeMigrationFile(
    w.root,
    `${MIGRATION_DIR}/execution-plan.json`,
    JSON.stringify(plan),
  );
  addLegacyEvidence(w, {
    label: "trusted",
    task: "1.1",
    exitCode: 0,
    review: {},
  });
  expect(
    (await callMigration(w.root, ["workflow", "migrate", "--to", "2"]))
      .exitCode,
  ).toBe(0);
  return w;
}
it("keeps historical tasks out of resume and satisfies a fully imported dependency", async () => {
  const w = await setup();
  const resumed = await callMigration(w.root, ["resume"]);
  expect(resumed.data.completed_tasks).toEqual(["1.1"]);
  expect(resumed.data.open_tasks).toEqual(["1.2"]);
  expect(resumed.data.task_origins).toEqual({ "1.1": "historical" });
  expect(resumed.data.next_step).toMatchObject({
    cycle: "cycle-2",
    tasks: ["1.2"],
  });
  expect(
    (
      await callMigration(w.root, [
        "cycle",
        "start",
        "--cycle",
        "cycle-2",
        "--executor",
        "worker",
      ])
    ).exitCode,
  ).toBe(0);
  const status = await callMigration(w.root, ["status"]);
  expect(status.data.completion.origins).toEqual({ "1.1": "historical" });
});
it("preserves all mixed-cycle context and queues only open tasks", async () => {
  const w = await setup(true);
  const context = await callMigration(w.root, ["context", "--task", "1.2"]);
  expect(context.data.tasks.map((t: any) => t.id)).toEqual(["1.1", "1.2"]);
  expect(context.data.acceptance.map((t: any) => t.id)).toEqual([
    "AC-1.1",
    "AC-1.2",
  ]);
  expect(context.data.open_tasks).toEqual(["1.2"]);
  expect(context.data.completed_tasks).toEqual(["1.1"]);
  expect(context.data.task_origins).toEqual({ "1.1": "historical" });
  expect(
    (await callMigration(w.root, ["resume"])).data.next_step.tasks,
  ).toEqual(["1.2"]);
});
it("preserves completed history when relevant source changes after migration", async () => {
  const w = await setup();
  writeMigrationFile(w.root, "src/app.ts", "later change");
  const resumed = await callMigration(w.root, ["resume"]);
  expect(resumed.data.completed_tasks).toEqual(["1.1"]);
  expect(
    resumed.data.unresolved_findings.some((f: any) =>
      /stale|Unreviewed/.test(f.message),
    ),
  ).toBe(true);
});

it("blocks a mixed predecessor until remaining work gets native closure", async () => {
  const w = migrationFixture([
    { id: "1.1", checked: true },
    { id: "1.2", checked: false },
    { id: "1.3", checked: false },
  ]);
  made.push(w);
  const plan = JSON.parse(
    readFileSync(
      path.join(w.root, MIGRATION_DIR, "execution-plan.json"),
      "utf8",
    ),
  );
  plan.cycles[0].tasks.push("1.2");
  plan.cycles[0].acceptance.push(...plan.cycles[1].acceptance);
  plan.cycles.splice(1, 1);
  plan.cycles[1].dependsOn = ["cycle-1"];
  writeMigrationFile(
    w.root,
    `${MIGRATION_DIR}/execution-plan.json`,
    JSON.stringify(plan),
  );
  writeMigrationFile(
    w.root,
    "tests/check.cjs",
    "const fs=require('fs'); if(fs.readFileSync('src/app.ts','utf8')!=='implemented remaining work'){console.error('missing 1.1');process.exit(1)}",
  );
  addLegacyEvidence(w, {
    label: "trusted",
    task: "1.1",
    exitCode: 0,
    review: {},
  });
  expect(
    (await callMigration(w.root, ["workflow", "migrate", "--to", "2"]))
      .exitCode,
  ).toBe(0);
  const start = (id: string) =>
    callMigration(w.root, [
      "cycle",
      "start",
      "--cycle",
      id,
      "--executor",
      "worker",
    ]);
  expect((await start("cycle-3")).exitCode).not.toBe(0);
  expect((await start("cycle-1")).exitCode).toBe(0);
  expect(
    (
      await callMigration(w.root, [
        "cycle",
        "run",
        "--cycle",
        "cycle-1",
        "--phase",
        "red",
      ])
    ).exitCode,
  ).toBe(0);
  writeMigrationFile(w.root, "src/app.ts", "implemented remaining work");
  expect(
    (
      await callMigration(w.root, [
        "cycle",
        "run",
        "--cycle",
        "cycle-1",
        "--phase",
        "green",
      ])
    ).exitCode,
  ).toBe(0);
  writeMigrationFile(
    w.root,
    `${MIGRATION_DIR}/native-review.json`,
    JSON.stringify({
      reviewer: "independent",
      verdict: "approved",
      acceptance: ["AC-1.1", "AC-1.2"],
      controls: [],
      findings: [],
    }),
  );
  expect(
    (
      await callMigration(w.root, [
        "cycle",
        "review",
        "--cycle",
        "cycle-1",
        "--file",
        `${MIGRATION_DIR}/native-review.json`,
      ])
    ).exitCode,
  ).toBe(0);
  expect(
    (await callMigration(w.root, ["cycle", "close", "--cycle", "cycle-1"]))
      .exitCode,
  ).toBe(0);
  const resumed = await callMigration(w.root, ["resume"]);
  expect(resumed.data.task_origins).toEqual({
    "1.1": "historical",
    "1.2": "native",
  });
  expect(resumed.data.next_step.tasks).toEqual(["1.3"]);
  expect((await start("cycle-3")).exitCode).toBe(0);
});
