import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEV } from "../../src/core/git/feature-branch.js";
import { readTaskRecord } from "../../src/core/tasks/records.js";
import { git, type GitWorkspace } from "../helpers/git-workspace.js";
import {
  CHANGE,
  commitIn,
  commitOnChangeBranch,
  createTaskWorkspace,
  FIXED_IMPL,
  planLine,
  pointRedRecordAtCodeCommit,
  report,
  rewriteHistoryDroppingRed,
  taskSteps,
  WEAKER_TEST,
} from "../helpers/task-workspace.js";

let ws: GitWorkspace;
let root: string;
let steps: ReturnType<typeof taskSteps>;

beforeEach(() => {
  ws = createTaskWorkspace();
  root = ws.root;
  steps = taskSteps(root);
});
afterEach(() => ws.remove());

describe("lexforge task close", { timeout: 20_000 }, () => {
  it("ticks the box, merges into the change branch and removes the worktree", async () => {
    await steps.approvedReview("1.1");
    const wt = steps.wt("1.1");
    const result = await steps.close("1.1");
    expect(result.exitCode).toBe(0);
    expect(planLine(root, "1.1")).toMatch(/^- \[x\] 1\.1/);
    expect(git(root, "log", "-1", "--format=%s", "feature/demo")).toBe("Task 1.1: Search over note text");
    expect(existsSync(wt)).toBe(false);
    expect(git(root, "branch", "--list", "lexforge/demo/1.1")).toBe("");
    expect(readTaskRecord(root, CHANGE, "1.1")!.closed).toMatchObject({ merge: git(root, "rev-parse", "HEAD") });
    expect(result.json.data).toMatchObject({
      merge: git(root, "rev-parse", "HEAD"),
      progress: { closed: 1, total: 8 },
      nextStep: "lexforge task start --change demo --task 1.2 --executor <id>",
    });
  });

  it("names a minor finding as a defect to record before the next task", async () => {
    await steps.reviewed("1.1", "approved", ["- minor: name the helper"]);
    const result = await steps.close("1.1");
    expect(result.exitCode).toBe(0);
    expect(result.json.data?.nextStep).toBe(
      'lexforge defect record --change demo --level minor --file <file> --line <n> --summary "name the helper"' +
        ", then run: lexforge task start --change demo --task 1.2 --executor <id>",
    );
  });

  it.each<[string, () => unknown]>([
    ["red-not-ancestor", () => rewriteHistoryDroppingRed(root, "1.1")],
    ["code-before-red", () => pointRedRecordAtCodeCommit(root, "1.1")],
    ["test-changed-after-red", () => commitIn(steps.wt("1.1"), { "test/notes.test.mjs": WEAKER_TEST })],
    ["undeclared-file", () => commitIn(steps.wt("1.1"), { "src/other.js": "x" })],
    [
      "review-stale",
      () => {
        commitIn(steps.wt("1.1"), { "src/notes.js": FIXED_IMPL });
        return steps.green("1.1");
      },
    ],
    ["review-stale", () => commitIn(steps.wt("1.1"), { "src/notes.js": FIXED_IMPL })],
    ["findings-open", () => steps.review("1.1", report({ verdict: "approved", findings: ["- critical: x"] }))],
  ])("refuses with %s and merges nothing", async (code, spoil) => {
    await steps.approvedReview("1.1");
    await spoil();
    const before = git(root, "rev-parse", "feature/demo");
    const result = await steps.close("1.1");
    expect(result.exitCode).toBe(2);
    expect(result.json.error?.code).toBe(code);
    expect(git(root, "rev-parse", "feature/demo")).toBe(before);
    expect(planLine(root, "1.1")).toMatch(/^- \[ \] 1\.1/);
  });

  it("refuses when the main worktree is not on the change branch", async () => {
    await steps.approvedReview("1.1");
    git(root, "checkout", DEV);
    const result = await steps.close("1.1");
    expect(result.json.error).toMatchObject({ code: "change-branch-not-checked-out" });
    expect(result.json.nextStep).toBe("git checkout feature/demo");
  });

  it("refuses when the main worktree holds changes outside the change directory", async () => {
    await steps.approvedReview("1.1");
    writeFileSync(`${root}/stray.txt`, "x");
    const result = await steps.close("1.1");
    expect(result.json.error).toMatchObject({ code: "change-branch-not-checked-out" });
    expect(result.json.nextStep).toBe("git status");
  });

  it("refuses a merge conflict, names the file and leaves the task unticked", async () => {
    await steps.approvedReview("1.1");
    commitOnChangeBranch(root, { "src/notes.js": "conflict\n" });
    const result = await steps.close("1.1");
    expect(result.json.error).toMatchObject({
      code: "merge-conflict",
      message: expect.stringContaining("src/notes.js"),
    });
    expect(result.json.nextStep).toBe(
      'lexforge journal add --change demo --kind question --text "<what the plan missed>"',
    );
    expect(planLine(root, "1.1")).toMatch(/^- \[ \] 1\.1/);
    expect(existsSync(steps.wt("1.1"))).toBe(true);
    expect(git(root, "status", "--porcelain", "--", "src")).toBe("");
  });

  it("closes a move task without a red record", async () => {
    expect((await steps.start("6.1")).exitCode).toBe(0);
    commitIn(steps.wt("6.1"), { "src/search-helpers.js": "export const h = 1;\n" }, "move");
    mkdirSync(`${root}/lexforge/changes/demo/tasks/6.1`, { recursive: true });
    writeFileSync(`${root}/lexforge/changes/demo/tasks/6.1/report.md`, "moved");
    expect((await steps.green("6.1")).exitCode).toBe(0);
    expect((await steps.review("6.1", report())).exitCode).toBe(0);
    const result = await steps.close("6.1");
    expect(result.exitCode).toBe(0);
    expect(planLine(root, "6.1")).toMatch(/^- \[x\] 6\.1/);
  });
});
