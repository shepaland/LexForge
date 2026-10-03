import assert from "node:assert/strict";
import { afterEach, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  MIGRATION_DIR,
  addLegacyEvidence,
  callMigration,
  migrationFixture,
  writeMigrationFile,
} from "../helpers/migration-workspace.js";
import type { GitWorkspace } from "../helpers/git-workspace.js";

const made: GitWorkspace[] = [];
afterEach(() => made.splice(0).forEach((workspace) => workspace.remove()));
const keep = (workspace: GitWorkspace) => (made.push(workspace), workspace);

async function preview(root: string, extra: string[] = []) {
  return callMigration(root, [
    "workflow",
    "migrate",
    "--to",
    "2",
    "--dry-run",
    ...extra,
  ]);
}

it("treats consistently missing review facts as verification gaps", async () => {
  for (const review of [{ omitProvenance: true }, { omitAcceptance: true }]) {
    const workspace = keep(migrationFixture([{ id: "1.1", checked: true }]));
    addLegacyEvidence(workspace, {
      label: review.omitProvenance ? "missing-provenance" : "missing-coverage",
      task: "1.1",
      exitCode: 0,
      review,
    });
    const result = await preview(workspace.root, ["--task", "1.1"]);
    assert.equal(
      result.data.task.classification,
      "needs-verification",
      "\nMigration review gaps remain\n",
    );
    expect(result.data.task.conflicts).toEqual([]);
    expect(result.data.task.gaps).toContainEqual(
      expect.objectContaining({
        code: "review-provenance-missing",
        minimumAction: expect.any(String),
      }),
    );
  }
});

it("reports every malformed original section dependency deterministically", async () => {
  const cases: [string, (text: string) => string][] = [
    [
      "section-dependency-unknown",
      (text) => text.replace("Depends on: 1", "Depends on: 99"),
    ],
    [
      "section-dependency-repeated",
      (text) => text.replace("Depends on: 1", "Depends on: 1\nDepends on: 1"),
    ],
    [
      "section-dependency-unreadable",
      (text) => text.replace("Depends on: 1", "Depends on: TBD"),
    ],
    [
      "section-dependency-missing",
      (text) => text.replace("Depends on: 1\n\n", ""),
    ],
  ];
  for (const [expected, mutate] of cases) {
    const workspace = keep(
      migrationFixture([
        { id: "1.1", checked: false, section: 1 },
        { id: "2.1", checked: false, section: 2 },
      ]),
    );
    const tasksFile = path.join(workspace.root, MIGRATION_DIR, "tasks.md");
    writeMigrationFile(
      workspace.root,
      `${MIGRATION_DIR}/tasks.md`,
      mutate(readFileSync(tasksFile, "utf8")),
    );
    const result = await preview(workspace.root);
    expect(
      result.data.blockers.map((item: any) => item.code),
      expected,
    ).toContain(expected);
  }
});

it("filtered task and class detail include applicable analysis findings", async () => {
  const cycles = [
    {
      id: "missing-acceptance",
      tasks: ["1.1"],
      dependsOn: [],
      files: [{ path: "src/app.ts" }],
      inputs: ["package.json"],
      command: "node tests/check.cjs 1.1",
      acceptance: [],
    },
  ];
  const root = keep(
    migrationFixture([{ id: "1.1", checked: false }], cycles),
  ).root;
  const summary = await preview(root);
  expect(summary.data.blockers[0].details).toContain("--class conflict");

  const byClass = await preview(root, ["--class", "conflict"]);
  expect(byClass.data.findings).toContainEqual(
    expect.objectContaining({
      code: "cycle-map-acceptance-missing",
      reason: expect.any(String),
      minimumAction: expect.any(String),
      sources: [`${MIGRATION_DIR}/execution-plan.json`],
    }),
  );
  const byTask = await preview(root, ["--task", "1.1"]);
  expect(byTask.data.findings.map((finding: any) => finding.code)).toContain(
    "cycle-map-acceptance-missing",
  );
});
