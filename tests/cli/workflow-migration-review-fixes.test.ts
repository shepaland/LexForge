import { afterEach, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cycleProblems } from "../../src/core/execution/context.js";
import {
  migrationFixture,
  addLegacyEvidence,
  callMigration,
  writeMigrationFile as write,
  MIGRATION_DIR as D,
} from "../helpers/migration-workspace.js";
import type { GitWorkspace } from "../helpers/git-workspace.js";
const made: GitWorkspace[] = [];
afterEach(() => made.splice(0).forEach((w) => w.remove()));
const setup = (open = false) => {
  const w = migrationFixture([
    { id: "1.1", checked: true },
    ...(open ? [{ id: "1.2", checked: false }] : []),
  ]);
  made.push(w);
  return w;
};
const apply = (root: string) =>
  callMigration(root, ["workflow", "migrate", "--to", "2"]);
const check = (root: string) =>
  callMigration(root, [
    "workflow",
    "reconcile",
    "--cycle",
    "cycle-1",
    "--executor",
    "author",
  ]);
async function approve(root: string, attempt: string) {
  write(
    root,
    `${D}/review.json`,
    JSON.stringify({
      version: 1,
      origin: "reconciled",
      attempt,
      reviewer: "independent",
      executor: "author",
      verdict: "approved",
      tasks: ["1.1"],
      acceptance: ["AC-1.1"],
    }),
  );
  return callMigration(root, [
    "workflow",
    "reconcile-review",
    "--cycle",
    "cycle-1",
    "--file",
    `${D}/review.json`,
  ]);
}
it.each(["code", "input", "command", "acceptance"])(
  "post-apply reconciliation preserves origin but stales changed %s",
  async (kind) => {
    const w = setup();
    write(
      w.root,
      "lexforge/config.yaml",
      "schema: spec-driven\nverification:\n  tests: node tests/check.cjs\n",
    );
    expect((await apply(w.root)).exitCode).toBe(0);
    const r = await check(w.root);
    expect((await approve(w.root, r.data.attempt)).exitCode).toBe(0);
    expect(cycleProblems(w.root, "demo")).toEqual([]);
    if (kind === "code") write(w.root, "src/app.ts", "unreviewed");
    if (kind === "input") write(w.root, "package.json", '{"changed":true}');
    if (kind === "command" || kind === "acceptance") {
      const p = JSON.parse(
        readFileSync(path.join(w.root, D, "execution-plan.json"), "utf8"),
      );
      if (kind === "command") p.cycles[0].command += " changed";
      else p.cycles[0].acceptance[0].description = "changed criterion";
      write(w.root, `${D}/execution-plan.json`, JSON.stringify(p));
    }
    expect((await callMigration(w.root, ["resume"])).data.task_origins).toEqual(
      { "1.1": "reconciled" },
    );
    expect(cycleProblems(w.root, "demo").some((s) => s.includes("stale"))).toBe(
      true,
    );
    await callMigration(w.root, ["evidence", "record", "--label", "tests"]);
    expect((await callMigration(w.root, ["verify"])).exitCode).not.toBe(0);
  },
);
it("the first native cycle refuses edits since migration and accepts restored baseline", async () => {
  const w = setup(true);
  addLegacyEvidence(w, {
    label: "trusted",
    task: "1.1",
    exitCode: 0,
    review: {},
  });
  const before = readFileSync(path.join(w.root, "src/app.ts"), "utf8");
  await apply(w.root);
  write(w.root, "src/app.ts", "unreviewed");
  const start = () =>
    callMigration(w.root, [
      "cycle",
      "start",
      "--cycle",
      "cycle-2",
      "--executor",
      "worker",
    ]);
  expect((await start()).exitCode).not.toBe(0);
  write(w.root, "src/app.ts", before);
  expect((await start()).exitCode).toBe(0);
});
it("a pending check can be reviewed after apply without mutating the hashed attempt", async () => {
  const w = setup();
  const r = await check(w.root);
  const file = path.join(w.root, r.data.source);
  const before = readFileSync(file, "utf8");
  expect((await apply(w.root)).exitCode).toBe(0);
  expect((await approve(w.root, r.data.attempt)).exitCode).toBe(0);
  expect(readFileSync(file, "utf8")).toBe(before);
  const resumed = await callMigration(w.root, ["resume"]);
  expect(resumed.exitCode).toBe(0);
  expect(resumed.data.task_origins).toEqual({ "1.1": "reconciled" });
});
it("does not promote a current reconciliation after outside code state changes", async () => {
  const w = setup();
  const r = await check(w.root);
  await approve(w.root, r.data.attempt);
  write(w.root, "src/dependency.ts", "changed");
  const preview = await callMigration(w.root, [
    "workflow",
    "migrate",
    "--to",
    "2",
    "--dry-run",
    "--task",
    "1.1",
  ]);
  expect(preview.data.task.origin).toBe(null);
});
it("resolves failed legacy evidence through explicit current approval and retains the conflict history", async () => {
  const w = setup();
  addLegacyEvidence(w, { label: "failed", task: "1.1", exitCode: 1 });
  const r = await check(w.root);
  expect((await approve(w.root, r.data.attempt)).exitCode).toBe(0);
  const preview = await callMigration(w.root, [
    "workflow",
    "migrate",
    "--to",
    "2",
    "--dry-run",
    "--task",
    "1.1",
  ]);
  expect(preview.data.task.origin).toBe("reconciled");
  expect(preview.data.task.resolvedConflicts[0].code).toBe(
    "task-evidence-conflict",
  );
  expect((await apply(w.root)).exitCode).toBe(0);
});
it("returns the full compact apply envelope and fails filtered conflict previews", async () => {
  const w = setup();
  const r = await apply(w.root);
  expect(r.data).toMatchObject({
    outputVersion: 1,
    sourceWorkflow: 1,
    targetWorkflow: 2,
    inputDigest: expect.stringMatching(/^sha256:/),
    summary: { tasks: 1, needsVerification: 1 },
    completedWrites: [`${D}/migration.json`, `${D}/workflow.json`],
    nextStep: expect.stringContaining("resume"),
  });
  const bad = setup();
  addLegacyEvidence(bad, { label: "failed", task: "1.1", exitCode: 1 });
  for (const filter of [
    ["--task", "1.1"],
    ["--class", "conflict"],
  ])
    expect(
      (
        await callMigration(bad.root, [
          "workflow",
          "migrate",
          "--to",
          "2",
          "--dry-run",
          ...filter,
        ])
      ).exitCode,
    ).toBe(1);
});
