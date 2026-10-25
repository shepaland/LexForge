import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lockPath } from "../../src/core/tasks/paths.js";
import { readTaskRecord } from "../../src/core/tasks/records.js";
import { git, type GitWorkspace } from "../helpers/git-workspace.js";
import { deadPid, writeLock } from "../helpers/lock.js";
import { CHANGE, CHANGE_DIR, cli, createTaskWorkspace, taskSteps } from "../helpers/task-workspace.js";

let ws: GitWorkspace;
let root: string;
let steps: ReturnType<typeof taskSteps>;

beforeEach(() => {
  ws = createTaskWorkspace();
  root = ws.root;
  steps = taskSteps(root);
});
afterEach(() => ws.remove());

describe("lexforge task abandon", { timeout: 20_000 }, () => {
  it("removes the worktree and the branch and counts the attempt", async () => {
    await steps.redDone("1.1");
    const wt = steps.wt("1.1");
    const result = await steps.abandon("1.1");
    expect(result.exitCode).toBe(0);
    expect(existsSync(wt)).toBe(false);
    expect(git(root, "branch", "--list", "lexforge/demo/1.1")).toBe("");
    expect(existsSync(path.join(root, CHANGE_DIR, "tasks", "1.1"))).toBe(false);
    expect(result.json.data).toMatchObject({
      attempts: 1,
      nextStep: "lexforge task start --change demo --task 1.1 --executor <id>",
    });
    expect(readTaskRecord(root, CHANGE, "1.1")).toMatchObject({
      executor: "",
      red: null,
      green: null,
      reviews: [],
      closed: null,
      attempts: 1,
    });
  });

  it("lets the task start again and keeps counting", async () => {
    await steps.redDone("1.1");
    expect((await steps.abandon("1.1")).exitCode).toBe(0);
    expect((await steps.start("1.1", "exec-2")).exitCode).toBe(0);
    expect(readTaskRecord(root, CHANGE, "1.1")).toMatchObject({ executor: "exec-2", attempts: 1 });
    expect((await steps.abandon("1.1")).json.data).toMatchObject({ attempts: 2 });
  });

  it("abandons a task whose worktree is already gone", async () => {
    expect((await steps.start("1.1")).exitCode).toBe(0);
    git(root, "worktree", "remove", "--force", steps.wt("1.1"));
    const result = await steps.abandon("1.1");
    expect(result.exitCode).toBe(0);
    expect(git(root, "branch", "--list", "lexforge/demo/1.1")).toBe("");
  });

  it("refuses a task that never started", async () => {
    const result = await steps.abandon("1.1");
    expect(result.json.error?.code).toBe("task-not-started");
    expect(result.json.nextStep).toBe("lexforge task start --change demo --task 1.1 --executor <id>");
  });
});

describe("lexforge unlock", () => {
  it("removes a lock left by a dead process", async () => {
    writeLock(root, CHANGE, { pid: deadPid(), startedAt: new Date().toISOString(), command: "task close" });
    const result = await cli(root, ["unlock", "--change", CHANGE, "--json"]);
    expect(result.exitCode).toBe(0);
    expect(result.json.data).toMatchObject({ removed: true, nextStep: "lexforge status --change demo" });
    expect(existsSync(lockPath(root, CHANGE))).toBe(false);
  });

  it("refuses a lock held by a live process and names the command to run after it", async () => {
    writeLock(root, CHANGE, { pid: process.pid, startedAt: new Date().toISOString(), command: "task close" });
    const result = await cli(root, ["unlock", "--change", CHANGE, "--json"]);
    expect(result.json.error?.code).toBe("lock-held-by-live-process");
    expect(result.json.nextStep).toBe(`wait for process ${process.pid} to finish, then run: lexforge unlock --change demo`);
  });
});
