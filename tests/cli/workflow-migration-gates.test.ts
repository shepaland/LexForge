import { afterEach, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cycleProblems } from "../../src/core/execution/context.js";
import {
  migrationFixture,
  addLegacyEvidence,
  callMigration,
  migrationTree,
  writeMigrationFile,
  MIGRATION_DIR,
} from "../helpers/migration-workspace.js";
import type { GitWorkspace } from "../helpers/git-workspace.js";
const made: GitWorkspace[] = [];
afterEach(() => made.splice(0).forEach((w) => w.remove()));
async function setup() {
  const w = migrationFixture([{ id: "1.1", checked: true }]);
  made.push(w);
  writeMigrationFile(
    w.root,
    "lexforge/config.yaml",
    "schema: spec-driven\nverification:\n  tests: node tests/check.cjs 1.1\n",
  );
  writeMigrationFile(w.root, "src/app.ts", "initial");
  addLegacyEvidence(w, {
    label: "tests",
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
it("accepts fresh confirmed history and archives the unchanged ledger", async () => {
  const w = await setup();
  expect(cycleProblems(w.root, "demo")).toEqual([]);
  const verified = await callMigration(w.root, ["verify"]);
  expect(verified.data.findings).toEqual([]);
  expect(verified.exitCode).toBe(0);
  const ledger = readFileSync(
    path.join(w.root, MIGRATION_DIR, "migration.json"),
    "utf8",
  );
  const archived = await callMigration(w.root, ["archive", "demo"]);
  expect(archived.exitCode, JSON.stringify(archived)).toBe(0);
  expect(
    readFileSync(
      path.resolve(w.root, archived.data.archivePath, "migration.json"),
      "utf8",
    ),
  ).toBe(ledger);
});
it.each(["code", "input", "command", "acceptance", "mapping"])(
  "retains history and blocks final writes after %s changes",
  async (kind) => {
    const w = await setup();
    if (kind === "code") writeMigrationFile(w.root, "src/app.ts", "changed");
    else if (kind === "input")
      writeMigrationFile(w.root, "package.json", '{"changed":true}');
    else {
      const plan = JSON.parse(
        readFileSync(
          path.join(w.root, MIGRATION_DIR, "execution-plan.json"),
          "utf8",
        ),
      );
      if (kind === "command") plan.cycles[0].command += " changed";
      if (kind === "acceptance")
        plan.cycles[0].acceptance[0].description = "changed requirement";
      if (kind === "mapping") plan.cycles[0].id = "new-cycle";
      writeMigrationFile(
        w.root,
        `${MIGRATION_DIR}/execution-plan.json`,
        JSON.stringify(plan),
      );
    }
    expect(
      (await callMigration(w.root, ["resume"])).data.completed_tasks,
    ).toEqual(["1.1"]);
    expect(
      cycleProblems(w.root, "demo").some((s) => /stale|Unreviewed/.test(s)),
    ).toBe(true);
    const before = migrationTree(w.root);
    expect(
      (await callMigration(w.root, ["archive", "demo"])).exitCode,
    ).not.toBe(0);
    expect(migrationTree(w.root)).toEqual(before);
  },
);
it("fresh checks cover changed code without rewriting history, while unrelated scope still blocks", async () => {
  const w = await setup();
  const ledger = readFileSync(
    path.join(w.root, MIGRATION_DIR, "migration.json"),
    "utf8",
  );
  writeMigrationFile(w.root, "src/app.ts", "changed");
  expect(cycleProblems(w.root, "demo").length).toBeGreaterThan(0);
  expect(
    (await callMigration(w.root, ["evidence", "record", "--label", "tests"]))
      .exitCode,
  ).toBe(0);
  expect(cycleProblems(w.root, "demo")).toEqual([]);
  expect(
    readFileSync(path.join(w.root, MIGRATION_DIR, "migration.json"), "utf8"),
  ).toBe(ledger);
  writeMigrationFile(w.root, "unrelated.txt", "outside planned scope");
  expect(cycleProblems(w.root, "demo").some((s) => s.includes("outside"))).toBe(
    true,
  );
});
it("damaged evidence or migration bytes block verify and archive without writes", async () => {
  for (const file of ["legacy/tests.log", "migration.json"]) {
    const w = await setup();
    writeMigrationFile(w.root, `${MIGRATION_DIR}/${file}`, "damaged");
    const before = migrationTree(w.root);
    expect((await callMigration(w.root, ["verify"])).exitCode).not.toBe(0);
    expect(
      (await callMigration(w.root, ["archive", "demo"])).exitCode,
    ).not.toBe(0);
    expect(migrationTree(w.root)).toEqual(before);
  }
});
