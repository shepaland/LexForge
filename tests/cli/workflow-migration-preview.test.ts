import assert from "node:assert/strict";
import { afterEach, expect, it } from "vitest";

import {
  MIGRATION_DIR,
  addLegacyEvidence,
  callMigration,
  migrationFixture,
  migrationTree,
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

it("persists uncertain checked work without trusting a checkbox alone", async () => {
  const root = keep(migrationFixture([{ id: "1.1", checked: true }])).root;
  const applied = await callMigration(root, [
    "workflow",
    "migrate",
    "--to",
    "2",
  ]);
  expect(applied.exitCode).toBe(0);
  expect(applied.data.version).toBe(2);

  const resumed = await callMigration(root, ["resume"]);
  expect(resumed.data.completed_tasks).toEqual([]);
  expect(resumed.data.open_tasks).toEqual(["1.1"]);
  expect(migrationTree(root)).toHaveProperty("migration.json");
});

it("previews every classification without changing a file", async () => {
  const workspace = keep(
    migrationFixture([
      { id: "1.1", checked: true },
      { id: "1.2", checked: true },
      { id: "1.3", checked: false },
      { id: "1.4", checked: true },
    ]),
  );
  addLegacyEvidence(workspace, {
    label: "confirmed",
    task: "1.1",
    exitCode: 0,
    review: {},
  });
  addLegacyEvidence(workspace, {
    label: "failed",
    task: "1.4",
    exitCode: 1,
  });
  const before = migrationTree(workspace.root);
  const result = await preview(workspace.root);

  assert.notEqual(
    result.exitCode,
    2,
    "\nMigration preview is not implemented\n",
  );
  expect(result.exitCode).toBe(1);
  expect(result.data).toMatchObject({
    sourceWorkflow: 1,
    targetWorkflow: 2,
    mode: "dry-run",
    applied: false,
    summary: {
      tasks: 4,
      historicallyConfirmed: 1,
      needsVerification: 1,
      incomplete: 1,
      conflicts: 1,
    },
  });
  expect(result.data.inputDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(JSON.stringify(result.data)).not.toContain("Implement behavior 1.1");
  expect(migrationTree(workspace.root)).toEqual(before);
});

it("requires an approving review whose source matches every provenance field", async () => {
  for (const [label, review] of [
    ["rejected", { sourceVerdict: "changes-requested" as const }],
    ["identity-mismatch", { sourceReviewer: "someone-else" }],
    ["coverage-mismatch", { sourceAcceptance: [] }],
  ] as const) {
    const workspace = keep(migrationFixture([{ id: "1.1", checked: true }]));
    addLegacyEvidence(workspace, {
      label,
      task: "1.1",
      exitCode: 0,
      review,
    });
    const result = await preview(workspace.root, ["--task", "1.1"]);
    expect(result.data.task.classification).toBe("conflict");
    expect(result.data.task.conflicts.map((item: any) => item.code)).toContain(
      "review-provenance-conflict",
    );
  }
});

it("keeps failed or wrong-state task evidence contradictory despite command mismatch", async () => {
  const workspace = keep(migrationFixture([{ id: "1.1", checked: true }]));
  addLegacyEvidence(workspace, {
    label: "wrong-command",
    task: "1.1",
    exitCode: 1,
    command: "node another-check.cjs",
  });
  const result = await preview(workspace.root, ["--task", "1.1"]);
  expect(result.data.task.classification).toBe("conflict");
  expect(result.data.task.conflicts.map((item: any) => item.code)).toContain(
    "task-evidence-conflict",
  );
});

it("blocks missing task acceptance and omitted original section dependencies", async () => {
  const cycles = [
    {
      id: "first",
      tasks: ["1.1"],
      dependsOn: [],
      files: [{ path: "src/app.ts" }],
      inputs: [],
      command: "node tests/check.cjs 1.1",
      acceptance: [{ id: "AC-1.1", task: "1.1" }],
    },
    {
      id: "second",
      tasks: ["2.1"],
      dependsOn: [],
      files: [{ path: "src/app.ts" }],
      inputs: [],
      command: "node tests/check.cjs 2.1",
      acceptance: [],
    },
  ];
  const root = keep(
    migrationFixture(
      [
        { id: "1.1", checked: false, section: 1 },
        { id: "2.1", checked: false, section: 2 },
      ],
      cycles,
    ),
  ).root;
  const result = await preview(root);
  expect(result.data.blockers.map((item: any) => item.code)).toEqual([
    "cycle-map-acceptance-missing",
    "cycle-map-section-dependency-missing",
  ]);
  const task = await preview(root, ["--task", "2.1"]);
  expect(task.data.task.dependencies).toEqual(["first"]);
});

it("changes the canonical digest for inputs, specs, design, and defect state", async () => {
  const mutations: [string, string][] = [
    ["package.json", '{"changed":true}\n'],
    [`${MIGRATION_DIR}/specs/demo/spec.md`, "changed requirement\n"],
    [`${MIGRATION_DIR}/design.md`, "# Design\n\n## Migration\nChanged.\n"],
    ["lexforge/defects.json", '{"outputVersion":1,"defects":[]}\n'],
  ];
  for (const [file, content] of mutations) {
    const workspace = keep(migrationFixture([{ id: "1.1", checked: false }]));
    const before = (await preview(workspace.root)).data.inputDigest;
    writeMigrationFile(workspace.root, file, content);
    const after = (await preview(workspace.root)).data.inputDigest;
    expect(after, file).not.toBe(before);
  }
});

it("returns bounded actionable reasons and deterministic filtered detail", async () => {
  const root = keep(migrationFixture([{ id: "1.1", checked: true }])).root;
  const first = await preview(root);
  const second = await preview(root);
  expect(first.data).toEqual(second.data);
  expect(first.data.gaps[0]).toMatchObject({
    code: "review-provenance-missing",
    reason: expect.any(String),
    minimumAction: expect.any(String),
    details: expect.stringContaining("--class needs-verification"),
    sources: [`${MIGRATION_DIR}/tasks.md`],
  });
  const detail = await preview(root, ["--class", "needs-verification"]);
  expect(detail.data.tasks.map((task: any) => task.id)).toEqual(["1.1"]);
  expect(detail.data.tasks[0].gaps[0].minimumAction).toEqual(
    expect.any(String),
  );
});

it("keeps the default response bounded for a 500-task plan", async () => {
  const tasks = Array.from({ length: 500 }, (_, index) => ({
    id: `1.${index + 1}`,
    checked: false,
    words: `SENTINEL-TASK-BODY-${index + 1}`,
  }));
  const cycle = {
    id: "large-plan",
    tasks: tasks.map((task) => task.id),
    dependsOn: [],
    files: [{ path: "src/app.ts" }],
    inputs: ["package.json"],
    command: "node tests/check.cjs",
    acceptance: tasks.map((task) => ({ id: `AC-${task.id}`, task: task.id })),
  };
  const root = keep(migrationFixture(tasks, [cycle])).root;
  const result = await preview(root);
  const rendered = JSON.stringify(result.data);
  expect(result.exitCode).toBe(0);
  expect(result.data.summary).toMatchObject({ tasks: 500, incomplete: 500 });
  expect(rendered.length).toBeLessThan(8_000);
  expect(rendered).not.toContain("SENTINEL-TASK-BODY");
});
