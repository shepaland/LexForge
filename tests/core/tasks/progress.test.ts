import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeProgress } from "../../../src/core/tasks/progress.js";
import { writeTaskRecord, type TaskRecord } from "../../../src/core/tasks/records.js";
import { createGitWorkspace, type GitWorkspace } from "../../helpers/git-workspace.js";
import { appendTask, CHANGE, planFiles } from "../../helpers/plan-fixture.js";

let ws: GitWorkspace;
let root: string;

beforeEach(() => {
  ws = createGitWorkspace(planFiles());
  root = ws.root;
  appendTask(root, "2.2");
});
afterEach(() => ws.remove());

function put(id: string, patch: Partial<TaskRecord>): void {
  writeTaskRecord(root, CHANGE, {
    id,
    origin: "native",
    executor: "exec-1",
    branch: `lexforge/${CHANGE}/${id}`,
    worktree: "/nowhere",
    base: "abc",
    startedAt: "2026-10-22T10:00:00.000Z",
    red: null,
    green: null,
    reviews: [],
    closed: null,
    attempts: 0,
    ...patch,
  });
}

const CLOSED = { merge: "def", at: "2026-10-22T11:00:00.000Z" };

describe("computeProgress", () => {
  it("counts closed, running, waiting and blocked tasks over the plan and by section", () => {
    put("1.1", { closed: CLOSED });
    put("1.2", {});
    expect(computeProgress(root, CHANGE)).toMatchObject({
      total: 4,
      closed: 1,
      inProgress: 1,
      waiting: 2,
      blocked: 0,
      sections: [
        { name: "1", total: 2, closed: 1, inProgress: 1 },
        { name: "2", total: 2, waiting: 2 },
      ],
    });
  });

  it("a ready task is in none of the counts but the total", () => {
    expect(computeProgress(root, CHANGE)).toMatchObject({ total: 4, closed: 0, inProgress: 0, waiting: 3, blocked: 0 });
  });

  it("a task whose dependency was abandoned twice is blocked", () => {
    put("1.1", { closed: CLOSED });
    put("1.2", { executor: "", attempts: 2 });
    expect(computeProgress(root, CHANGE)).toMatchObject({ blocked: 2, waiting: 0, inProgress: 0 });
  });

  it("an abandoned task is not in progress", () => {
    put("1.1", { executor: "", attempts: 1 });
    expect(computeProgress(root, CHANGE)).toMatchObject({ inProgress: 0 });
  });
});
