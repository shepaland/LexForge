import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type GitWorkspace } from "../helpers/git-workspace.js";
import { assertPlanApproved, readPlanState } from "../../src/core/tasks/plan-state.js";
import { writeTaskRecord, type TaskRecord } from "../../src/core/tasks/records.js";
import {
  CHANGE,
  amendCall,
  appendTask,
  approved,
  createPlanWorkspace,
  edit,
  review,
} from "../helpers/plan-fixture.js";

let ws: GitWorkspace;
let root: string;

beforeEach(() => {
  ws = createPlanWorkspace();
  root = ws.root;
});
afterEach(() => ws.remove());

function closeTask(id: string): void {
  writeTaskRecord(root, CHANGE, record(id, { merge: "def", at: "2026-10-22T11:00:00.000Z" }));
}

function startTask(id: string): void {
  writeTaskRecord(root, CHANGE, record(id, null));
}

function record(id: string, closed: TaskRecord["closed"]): TaskRecord {
  return {
    id,
    origin: "native",
    executor: "e",
    branch: `lexforge/demo/${id}`,
    worktree: "/w",
    base: "abc",
    startedAt: "2026-10-22T10:00:00.000Z",
    red: null,
    green: null,
    reviews: [],
    closed,
    attempts: 1,
  };
}

describe("lexforge plan amend", () => {
  it("accepts a new task appended after approval", async () => {
    await approved(root);
    appendTask(root, "1.3");
    const result = await amendCall(root, "добавь задачу на миграцию");
    expect(result.exitCode).toBe(0);
    expect(result.json.data).toMatchObject({
      changedTasks: ["1.3"],
      nextStep: "lexforge plan review --change demo --angle amendment --file <report.md>",
    });
    expect(readPlanState(root, CHANGE).amendments).toHaveLength(1);
    expect(readPlanState(root, CHANGE).amendments[0]!.quote).toBe("добавь задачу на миграцию");
  });

  it("refuses a change to the text of a closed task", async () => {
    await approved(root);
    closeTask("1.1");
    edit(root, "1.1", "renamed");
    const result = await amendCall(root, "ok");
    expect(result.json.error).toMatchObject({ code: "closed-task-changed", message: expect.stringContaining("1.1") });
  });

  it("allows a change to the text of an open task", async () => {
    await approved(root);
    closeTask("1.1");
    edit(root, "1.2", "renamed");
    const result = await amendCall(root, "ok");
    expect(result.json.data?.changedTasks).toEqual(["1.2"]);
  });

  it("compares a closed task with the latest amendment, not with the approval", async () => {
    await approved(root);
    edit(root, "1.1", "renamed");
    expect((await amendCall(root, "first")).exitCode).toBe(0);
    closeTask("1.1");
    appendTask(root, "1.3");
    const result = await amendCall(root, "second");
    expect(result.json.data?.changedTasks).toEqual(["1.3"]);
  });

  it("refuses when nothing changed", async () => {
    await approved(root);
    expect((await amendCall(root, "ok")).json.error?.code).toBe("plan-unchanged");
  });

  it("refuses an empty quote and an unapproved plan", async () => {
    expect((await amendCall(root, "")).json.error?.code).toBe("quote-required");
    expect((await amendCall(root, "ok")).json.error?.code).toBe("plan-not-approved");
  });

  it("holds task commands back until the amendment review approves it", async () => {
    await approved(root);
    appendTask(root, "1.3");
    await amendCall(root);
    expect(() => assertPlanApproved(root, CHANGE)).toThrowError(
      expect.objectContaining({ code: "amendment-not-reviewed" }),
    );
    const result = await review(root, "amendment");
    expect(result.exitCode).toBe(0);
    expect(result.json.data?.nextStep).toBe("lexforge task start --change demo --task 1.1 --executor <id>");
    expect(() => assertPlanApproved(root, CHANGE)).not.toThrow();
    expect((await review(root, "amendment")).json.error?.code).toBe("no-amendment-pending");
  });

  it("names a new amendment, not a new review, after a changes-requested amendment review", async () => {
    await approved(root);
    appendTask(root, "1.3");
    await amendCall(root);
    const result = await review(root, "amendment", "changes-requested", "- important: task 1.3 has no test");
    expect(result.json.data?.nextStep).toBe(
      "fix the plan, then run: lexforge plan amend --change demo --quote \"<owner's words>\"",
    );
  });

  it("does not name a task that already has a record as the next task", async () => {
    await approved(root);
    startTask("1.1");
    appendTask(root, "1.3");
    await amendCall(root);
    const result = await review(root, "amendment");
    expect(result.json.data?.nextStep).not.toContain("--task 1.1 ");
  });
});
