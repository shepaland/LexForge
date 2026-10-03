import { afterEach, expect, it } from "vitest";
import { analyzeMigration } from "../../../src/core/execution/migration-analysis.js";
import {
  makeMigrationState,
  parseMigrationState,
  canonical,
} from "../../../src/core/execution/migration-state.js";
import {
  migrationFixture,
  addLegacyEvidence,
} from "../../helpers/migration-workspace.js";
import type { GitWorkspace } from "../../helpers/git-workspace.js";
const made: GitWorkspace[] = [];
afterEach(() => made.splice(0).forEach((w) => w.remove()));
it("preserves trust decisions with stable canonical bytes and rejects damaged state", () => {
  const w = migrationFixture([
    { id: "1.1", checked: true },
    { id: "1.2", checked: true },
  ]);
  made.push(w);
  addLegacyEvidence(w, {
    label: "trusted",
    task: "1.1",
    exitCode: 0,
    review: {},
  });
  const analysis = analyzeMigration(w.root, "demo");
  const state = makeMigrationState(
    w.root,
    "demo",
    analysis,
    "2026-10-02T12:00:00.000Z",
  );
  expect(state.tasks.map((t) => t.classification)).toEqual([
    "historically-confirmed",
    "needs-verification",
  ]);
  expect(canonical(state)).toBe(
    canonical(makeMigrationState(w.root, "demo", analysis, state.createdAt)),
  );
  expect(parseMigrationState(state).tasks[0].origin).toBe("historical");
  expect(() => parseMigrationState({ ...state, unexpected: true })).toThrow();
  const damaged = structuredClone(state);
  damaged.tasks[1].origin = "historical";
  expect(() => parseMigrationState(damaged)).toThrow();
});
