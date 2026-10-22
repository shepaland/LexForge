import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acceptedDigest,
  assertPlanApproved,
  planDigest,
  planTaskTexts,
  readPlanState,
  writePlanState,
} from "../../../src/core/tasks/plan-state.js";
import { planStatePath } from "../../../src/core/tasks/paths.js";
import { createGitWorkspace, type GitWorkspace } from "../../helpers/git-workspace.js";
import { CHANGE, edit, planFiles, tick } from "../../helpers/plan-fixture.js";
import { existsSync, writeFileSync } from "node:fs";

let ws: GitWorkspace;
let root: string;
const now = "2026-10-22T10:00:00.000Z";

function approve(): void {
  const state = readPlanState(root, CHANGE);
  state.approval = {
    quote: "go",
    digest: planDigest(root, CHANGE),
    base: "abc",
    taskTexts: planTaskTexts(root, CHANGE),
    at: now,
  };
  writePlanState(root, CHANGE, state);
}

function amend(): void {
  const state = readPlanState(root, CHANGE);
  state.amendments.push({
    quote: "more",
    digest: planDigest(root, CHANGE),
    taskTexts: planTaskTexts(root, CHANGE),
    at: now,
  });
  writePlanState(root, CHANGE, state);
}

beforeEach(() => {
  ws = createGitWorkspace(planFiles());
  root = ws.root;
});
afterEach(() => ws.remove());

describe("planDigest", () => {
  it("a ticked checkbox does not change the digest", () => {
    const before = planDigest(root, CHANGE);
    tick(root, "1.1");
    expect(planDigest(root, CHANGE)).toBe(before);
  });

  it("a changed word in a section file changes the digest", () => {
    const before = planDigest(root, CHANGE);
    edit(root, "1.1", "renamed");
    expect(planDigest(root, CHANGE)).not.toBe(before);
  });

  it("task texts do not hold the checkbox and change with the task", () => {
    const before = planTaskTexts(root, CHANGE);
    tick(root, "1.1");
    expect(planTaskTexts(root, CHANGE)).toEqual(before);
    edit(root, "1.1", "renamed");
    const after = planTaskTexts(root, CHANGE);
    expect(Object.keys(after)).toEqual(["1.1", "1.2", "2.1"]);
    expect(after["1.1"]).not.toBe(before["1.1"]);
    expect(after["1.2"]).toBe(before["1.2"]);
  });
});

describe("plan state file", () => {
  it("an absent file reads as an empty state", () => {
    expect(readPlanState(root, CHANGE)).toEqual({
      version: 1,
      reviews: [],
      approval: null,
      amendments: [],
      migratedFrom: null,
    });
    expect(existsSync(planStatePath(root, CHANGE))).toBe(false);
  });

  it("writes and reads a state back", () => {
    approve();
    expect(readPlanState(root, CHANGE).approval).toMatchObject({ quote: "go", base: "abc" });
  });

  it("refuses a file that is not a plan state", () => {
    writePlanState(root, CHANGE, readPlanState(root, CHANGE));
    writeFileSync(planStatePath(root, CHANGE), '{"version":2}');
    expect(() => readPlanState(root, CHANGE)).toThrowError(
      expect.objectContaining({ code: "plan-state-unreadable" }),
    );
  });
});

describe("acceptedDigest", () => {
  it("is null before approval, the approval digest after, the last amendment digest later", () => {
    expect(acceptedDigest(readPlanState(root, CHANGE))).toBeNull();
    approve();
    const first = planDigest(root, CHANGE);
    expect(acceptedDigest(readPlanState(root, CHANGE))).toBe(first);
    edit(root, "1.1", "renamed");
    amend();
    expect(acceptedDigest(readPlanState(root, CHANGE))).toBe(planDigest(root, CHANGE));
    expect(planDigest(root, CHANGE)).not.toBe(first);
  });
});

describe("assertPlanApproved", () => {
  it("refuses a task start on an unapproved plan", () => {
    expect(() => assertPlanApproved(root, CHANGE)).toThrowError(
      expect.objectContaining({
        code: "plan-not-approved",
        nextStep: "lexforge plan approve --change demo --quote \"<owner's words>\"",
      }),
    );
  });

  it("passes on an approved plan, ticks included", () => {
    approve();
    tick(root, "1.1");
    expect(() => assertPlanApproved(root, CHANGE)).not.toThrow();
  });

  it("refuses a task start once the plan changed after approval", () => {
    approve();
    edit(root, "1.1", "renamed");
    expect(() => assertPlanApproved(root, CHANGE)).toThrowError(
      expect.objectContaining({
        code: "plan-changed",
        nextStep: "lexforge plan amend --change demo --quote \"<owner's words>\"",
      }),
    );
  });

  it("refuses a task start after an amendment with no approved amendment review", () => {
    approve();
    amend();
    expect(() => assertPlanApproved(root, CHANGE)).toThrowError(
      expect.objectContaining({
        code: "amendment-not-reviewed",
        nextStep: expect.stringContaining("--angle amendment"),
      }),
    );
  });

  it("passes once the amendment has an approved review of its digest", () => {
    approve();
    amend();
    const state = readPlanState(root, CHANGE);
    state.reviews.push({
      angle: "amendment",
      reviewer: "r",
      verdict: "approved",
      findings: [],
      digest: planDigest(root, CHANGE),
      file: "x.md",
      at: now,
    });
    writePlanState(root, CHANGE, state);
    expect(() => assertPlanApproved(root, CHANGE)).not.toThrow();
  });

  it("does not take a review of an older digest for the amendment's", () => {
    approve();
    const state = readPlanState(root, CHANGE);
    state.reviews.push({
      angle: "amendment",
      reviewer: "r",
      verdict: "approved",
      findings: [],
      digest: "old",
      file: "x.md",
      at: now,
    });
    writePlanState(root, CHANGE, state);
    amend();
    expect(() => assertPlanApproved(root, CHANGE)).toThrowError(
      expect.objectContaining({ code: "amendment-not-reviewed" }),
    );
  });
});
