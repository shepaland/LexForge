import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readTaskRecord } from "../../src/core/tasks/records.js";
import { git, type GitWorkspace } from "../helpers/git-workspace.js";
import { CHANGE, CHANGE_DIR, createTaskWorkspace, taskSteps, TASKS } from "../helpers/task-workspace.js";

let ws: GitWorkspace | undefined;
afterEach(() => ws?.remove());

function open(options: { approved?: boolean; setup?: string } = {}) {
  ws = createTaskWorkspace(TASKS, options);
  return { root: ws.root, ...taskSteps(ws.root) };
}

describe("lexforge task start", () => {
  it("opens a worktree on its own branch and writes the brief", async () => {
    const { root, start } = open();
    const result = await start("1.1");
    expect(result.exitCode).toBe(0);
    const brief = readFileSync(path.join(root, CHANGE_DIR, "tasks/1.1/brief.md"), "utf8");
    expect(result.json.data).toMatchObject({
      branch: "lexforge/demo/1.1",
      nextStep: "commit the test alone in the worktree, then run: lexforge task red --change demo --task 1.1",
    });
    const worktree = result.json.data!.worktree as string;
    for (const part of [
      "Search over note text",
      "#### Scenario:",
      "Files:",
      "node --test test/notes.test.mjs",
      worktree,
      "## Engineering rules",
      "Do not tick checkboxes",
      "Search is a plain substring match.",
    ]) {
      expect(brief).toContain(part);
    }
    expect(brief).not.toContain("### Requirement: Unrelated");
    expect(git(worktree, "rev-parse", "--abbrev-ref", "HEAD")).toBe("lexforge/demo/1.1");
    expect(readTaskRecord(root, CHANGE, "1.1")).toMatchObject({ executor: "exec-1", red: null, closed: null });
  });

  it("puts the brief sections in order", async () => {
    const { root, start } = open();
    await start("1.1");
    const brief = readFileSync(path.join(root, CHANGE_DIR, "tasks/1.1/brief.md"), "utf8");
    const order = ["## Task", "## Requirements", "## Decisions", "## Engineering rules", "## How to work"].map((h) =>
      brief.indexOf(h),
    );
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("refuses a task whose dependency is open", async () => {
    const { start } = open();
    const result = await start("1.2");
    expect(result.exitCode).toBe(2);
    expect(result.json.error?.code).toBe("task-dependencies-open");
    expect(result.json.nextStep).toBe("lexforge task start --change demo --task 1.1 --executor <id>");
  });

  it("names the running dependency instead of starting it again", async () => {
    const { start } = open();
    await start("1.1");
    const result = await start("1.2");
    expect(result.json.error?.code).toBe("task-dependencies-open");
    expect(result.json.nextStep).toBe(
      "finish task 1.1, then run: lexforge task start --change demo --task 1.2 --executor <id>",
    );
  });

  it("refuses a task whose files overlap a running task", async () => {
    const { start } = open();
    await start("2.1");
    const result = await start("3.1");
    expect(result.json.error).toMatchObject({ code: "task-files-overlap", message: expect.stringContaining("src/notes.js") });
    expect(result.json.nextStep).toBe(
      "finish task 2.1, then run: lexforge task start --change demo --task 3.1 --executor <id>",
    );
  });

  it("starts two independent tasks side by side", async () => {
    const { start } = open();
    expect((await start("2.1")).exitCode).toBe(0);
    expect((await start("4.1")).exitCode).toBe(0);
  });

  it("refuses a closed or already running task", async () => {
    const { start } = open();
    await start("1.1");
    const result = await start("1.1");
    expect(result.json.error?.code).toBe("task-already-started");
    expect(result.json.nextStep).toBe("lexforge status --change demo");
  });

  it("refuses a task the plan does not hold", async () => {
    const { start } = open();
    const result = await start("9.9");
    expect(result.json.error?.code).toBe("task-not-found");
    expect(result.json.nextStep).toBe("lexforge status --change demo");
  });

  it("refuses before the plan is approved", async () => {
    const { start } = open({ approved: false });
    expect((await start("1.1")).json.error?.code).toBe("plan-not-approved");
  });

  it("runs worktree.setup inside the new worktree", async () => {
    const { root, start } = open({ setup: "node -e \"require('fs').writeFileSync('ready','')\"" });
    expect((await start("1.1")).exitCode).toBe(0);
    expect(existsSync(path.join(root, ".lexforge/worktrees/demo/1.1/ready"))).toBe(true);
  });

  it("removes the worktree and refuses when worktree.setup fails", async () => {
    const { root, start, wt } = open({ setup: "node -e \"console.log('setup broke'); process.exit(4)\"" });
    const result = await start("1.1");
    expect(result.json.error).toMatchObject({ code: "worktree-setup-failed", message: expect.stringContaining("setup broke") });
    expect(result.json.nextStep).toBe("fix worktree.setup in lexforge/config.yaml, then run: lexforge task start --change demo --task 1.1 --executor <id>");
    expect(existsSync(wt("1.1"))).toBe(false);
    expect(git(root, "branch", "--list", "lexforge/demo/1.1")).toBe("");
    expect(readTaskRecord(root, CHANGE, "1.1")).toBeNull();
  });

  it("refuses an executor that is not named", async () => {
    const { root } = open();
    const { cli } = await import("../helpers/task-workspace.js");
    const result = await cli(root, ["task", "start", "--change", "demo", "--task", "1.1", "--executor", " "]);
    expect(result.json.error?.code).toBe("executor-missing");
  });
});
