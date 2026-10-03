import { afterEach, expect, it, vi } from "vitest";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import * as fs from "node:fs";
import {
  migrationFixture,
  addLegacyEvidence,
  callMigration,
  migrationTree,
  MIGRATION_DIR,
  writeMigrationFile,
} from "../helpers/migration-workspace.js";
import { git, type GitWorkspace } from "../helpers/git-workspace.js";
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});
const made: GitWorkspace[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  made.splice(0).forEach((w) => w.remove());
});
const setup = () => {
  const w = migrationFixture([{ id: "1.1", checked: true }]);
  made.push(w);
  addLegacyEvidence(w, {
    label: "trusted",
    task: "1.1",
    exitCode: 0,
    review: {},
  });
  return w;
};
const apply = (root: string) =>
  callMigration(root, ["workflow", "migrate", "--to", "2"]);
it("persists the ledger before pinning and identical reruns leave every byte unchanged", async () => {
  const w = setup();
  expect((await apply(w.root)).exitCode).toBe(0);
  const tree = migrationTree(w.root);
  expect(tree).toHaveProperty("migration.json");
  expect(
    JSON.parse(
      readFileSync(path.join(w.root, MIGRATION_DIR, "migration.json"), "utf8"),
    ).tasks[0].origin,
  ).toBe("historical");
  const again = await apply(w.root);
  expect(again.data.mode).toBe("already-applied");
  expect(migrationTree(w.root)).toEqual(tree);
});
it("refuses active execution and does not touch targets", async () => {
  const w = setup();
  writeMigrationFile(w.root, `${MIGRATION_DIR}/execution.lock`, "");
  const before = migrationTree(w.root);
  expect((await apply(w.root)).exitCode).not.toBe(0);
  expect(migrationTree(w.root)).toEqual(before);
});
it.each([
  "src/app.ts",
  `${MIGRATION_DIR}/tasks.md`,
  `${MIGRATION_DIR}/execution-plan.json`,
  `${MIGRATION_DIR}/legacy/trusted.log`,
])("reanalyses changed preview input %s", async (file) => {
  const w = setup();
  await callMigration(w.root, [
    "workflow",
    "migrate",
    "--to",
    "2",
    "--dry-run",
  ]);
  writeMigrationFile(w.root, file, "damaged");
  expect((await apply(w.root)).exitCode).not.toBe(0);
  expect(existsSync(path.join(w.root, MIGRATION_DIR, "workflow.json"))).toBe(
    false,
  );
});
it("recovers a matching prepared ledger and refuses unexplained target edits", async () => {
  const w = setup();
  expect((await apply(w.root)).exitCode).toBe(0);
  const ledger = readFileSync(
    path.join(w.root, MIGRATION_DIR, "migration.json"),
    "utf8",
  );
  unlinkSync(path.join(w.root, MIGRATION_DIR, "workflow.json"));
  expect((await apply(w.root)).data.mode).toBe("recovered");
  expect(
    readFileSync(path.join(w.root, MIGRATION_DIR, "migration.json"), "utf8"),
  ).toBe(ledger);
  unlinkSync(path.join(w.root, MIGRATION_DIR, "workflow.json"));
  writeMigrationFile(
    w.root,
    `${MIGRATION_DIR}/migration.json`,
    ledger.replace("historical", "invented"),
  );
  const before = migrationTree(w.root);
  expect((await apply(w.root)).exitCode).not.toBe(0);
  expect(migrationTree(w.root)).toEqual(before);
});
it("leaves native workflow 2 alone", async () => {
  const w = setup();
  writeMigrationFile(
    w.root,
    `${MIGRATION_DIR}/workflow.json`,
    JSON.stringify({ version: 2, schema: "spec-driven", schemaVersion: 1 }),
  );
  const before = migrationTree(w.root);
  expect((await apply(w.root)).data.mode).toBe("native");
  expect(migrationTree(w.root)).toEqual(before);
});
it("an interruption at the pin leaves a durable recoverable ledger", async () => {
  const w = setup();
  const original = (await vi.importActual<typeof import("node:fs")>("node:fs"))
    .renameSync;
  vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    if (String(to).endsWith("/workflow.json")) {
      expect(
        existsSync(path.join(w.root, MIGRATION_DIR, "migration.json")),
      ).toBe(true);
      throw new Error("interrupted pin");
    }
    original(from, to);
  });
  expect((await apply(w.root)).exitCode).not.toBe(0);
  expect(existsSync(path.join(w.root, MIGRATION_DIR, "workflow.json"))).toBe(
    false,
  );
  vi.restoreAllMocks();
  expect((await apply(w.root)).data.mode).toBe("recovered");
});
it("refuses a missing ledger behind a migrated workflow pin instead of treating it as native", async () => {
  const w = setup();
  expect((await apply(w.root)).exitCode).toBe(0);
  unlinkSync(path.join(w.root, MIGRATION_DIR, "migration.json"));
  expect((await apply(w.root)).exitCode).not.toBe(0);
  expect((await callMigration(w.root, ["resume"])).exitCode).not.toBe(0);
});
it("refuses source changes during durable ledger installation before exposing workflow 2", async () => {
  const w = setup();
  const original = (await vi.importActual<typeof import("node:fs")>("node:fs"))
    .renameSync;
  vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    original(from, to);
    if (String(to).endsWith("/migration.json"))
      writeMigrationFile(w.root, "src/app.ts", "concurrent edit");
  });
  expect((await apply(w.root)).exitCode).not.toBe(0);
  expect(existsSync(path.join(w.root, MIGRATION_DIR, "workflow.json"))).toBe(
    false,
  );
});

it.each(["outside", "head", "config", "index"])(
  "refuses concurrent decision input change: %s",
  async (kind) => {
    const w = setup();
    if (kind === "index") {
      const original = readFileSync(
        path.join(w.root, MIGRATION_DIR, "tasks.md"),
        "utf8",
      );
      writeMigrationFile(
        w.root,
        `${MIGRATION_DIR}/tasks/one.md`,
        original.replace(/^## 1.*\n\n/, ""),
      );
      writeMigrationFile(
        w.root,
        `${MIGRATION_DIR}/tasks.md`,
        "## 1. Original heading\n\n`tasks/one.md`\n",
      );
    }
    const rename = (await vi.importActual<typeof import("node:fs")>("node:fs"))
      .renameSync;
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      rename(from, to);
      if (!String(to).endsWith("/migration.json")) return;
      if (kind === "outside")
        writeMigrationFile(w.root, "outside.txt", "changed");
      if (kind === "head")
        git(w.root, "commit", "--allow-empty", "--message", "concurrent");
      if (kind === "config")
        writeMigrationFile(
          w.root,
          "lexforge/config.yaml",
          "schema: spec-driven\ncontext: changed\n",
        );
      if (kind === "index")
        writeMigrationFile(
          w.root,
          `${MIGRATION_DIR}/tasks.md`,
          "## 1. Changed heading\n\n`tasks/one.md`\n",
        );
    });
    expect((await apply(w.root)).exitCode).not.toBe(0);
    expect(existsSync(path.join(w.root, MIGRATION_DIR, "workflow.json"))).toBe(
      false,
    );
  },
);
