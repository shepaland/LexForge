import { afterEach, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  migrationFixture,
  callMigration,
  writeMigrationFile,
  MIGRATION_DIR,
} from "../helpers/migration-workspace.js";
import type { GitWorkspace } from "../helpers/git-workspace.js";
const made: GitWorkspace[] = [];
afterEach(() => made.splice(0).forEach((w) => w.remove()));
const setup = () => {
  const w = migrationFixture([{ id: "1.1", checked: true }]);
  made.push(w);
  return w;
};
async function check(root: string) {
  return callMigration(root, [
    "workflow",
    "reconcile",
    "--cycle",
    "cycle-1",
    "--executor",
    "author",
  ]);
}
function review(root: string, attempt: string, extra = {}) {
  writeMigrationFile(
    root,
    `${MIGRATION_DIR}/review.json`,
    JSON.stringify({
      version: 1,
      origin: "reconciled",
      attempt,
      reviewer: "reviewer",
      executor: "author",
      verdict: "approved",
      tasks: ["1.1"],
      acceptance: ["AC-1.1"],
      ...extra,
    }),
  );
  return callMigration(root, [
    "workflow",
    "reconcile-review",
    "--cycle",
    "cycle-1",
    "--file",
    `${MIGRATION_DIR}/review.json`,
  ]);
}
it("records an actual current check and independent approval without invented RED", async () => {
  const w = setup();
  const checked = await check(w.root);
  expect(checked.exitCode).toBe(0);
  const approved = await review(w.root, checked.data.attempt);
  expect(approved.exitCode).toBe(0);
  expect(approved.data).toMatchObject({
    origin: "reconciled",
    confirmed: true,
    tasks: ["1.1"],
  });
  const stored = readFileSync(path.join(w.root, approved.data.source), "utf8");
  expect(stored).not.toContain('"phase"');
  expect(stored).not.toContain('"red"');
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
});
it.each([
  { reviewer: "author" },
  { acceptance: [] },
  { tasks: [] },
  { verdict: "changes-requested" },
])(
  "keeps incomplete or nonindependent approval unconfirmed: %j",
  async (extra) => {
    const w = setup();
    const checked = await check(w.root);
    expect(checked.exitCode).toBe(0);
    const result = await review(w.root, checked.data.attempt, extra);
    expect(result.exitCode).not.toBe(0);
  },
);
it("retains failed attempts and refuses stale code between check and approval", async () => {
  const w = setup();
  const checked = await check(w.root);
  expect(checked.exitCode).toBe(0);
  writeMigrationFile(w.root, "src/app.ts", "changed");
  expect((await review(w.root, checked.data.attempt)).exitCode).not.toBe(0);
  writeMigrationFile(w.root, "tests/check.cjs", "process.exit(1)");
  const failed = await check(w.root);
  expect(failed.exitCode).toBe(1);
  expect(failed.data).toMatchObject({ accepted: false, exitCode: 1 });
  expect(readFileSync(path.join(w.root, failed.data.source), "utf8")).toContain(
    '"exitCode": 1',
  );
});
it("does not promote a review refused for changed code after code is restored", async () => {
  const w = setup();
  const checked = await check(w.root);
  expect(checked.exitCode).toBe(0);
  writeMigrationFile(w.root, "package.json", '{"changed":true}');
  expect((await review(w.root, checked.data.attempt)).exitCode).not.toBe(0);
  writeMigrationFile(w.root, "package.json", "{}\n");
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
