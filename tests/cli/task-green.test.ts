import { readFileSync, rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readTaskRecord } from "../../src/core/tasks/records.js";
import { writeAt, type GitWorkspace } from "../helpers/git-workspace.js";
import {
  CHANGE,
  commitIn,
  createTaskWorkspace,
  FIXED_IMPL,
  head,
  IMPL,
  taskSteps,
  WEAKER_TEST,
  WRONG_IMPL,
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

describe("lexforge task green", () => {
  it("refuses green without the executor report", async () => {
    await steps.redDone("1.1");
    commitIn(steps.wt("1.1"), { "src/notes.js": IMPL });
    rmSync(steps.reportMd("1.1"), { force: true });
    const result = await steps.green("1.1");
    expect(result.json.error?.code).toBe("executor-report-missing");
    expect(result.json.nextStep).toBe(
      "write lexforge/changes/demo/tasks/1.1/report.md, then run: lexforge task green --change demo --task 1.1",
    );
  });

  it("records green after the implementation commit and writes the review package", async () => {
    await steps.redDone("1.1");
    const commit = commitIn(steps.wt("1.1"), { "src/notes.js": IMPL });
    const result = await steps.green("1.1");
    expect(result.exitCode).toBe(0);
    expect(result.json.data?.nextStep).toBe(
      "send lexforge/changes/demo/tasks/1.1/review.md to a reviewer, then run: lexforge task review --change demo --task 1.1 --file <report.md>",
    );
    expect(readTaskRecord(root, CHANGE, "1.1")!.green).toMatchObject({ commit, exitCode: 0 });
    const pack = readFileSync(steps.reviewMd("1.1"), "utf8");
    expect(pack).toContain("+export function searchNotes");
    expect(pack).toContain("executor says: done");
    expect(pack).toContain("lexforge/changes/demo/tasks/1.1/brief.md");
    expect(pack).toContain("Verdict:");
    expect(pack).not.toContain("## Since the last review");
  });

  it("refuses a test file changed after red", async () => {
    await steps.redDone("1.1");
    commitIn(steps.wt("1.1"), { "src/notes.js": IMPL, "test/notes.test.mjs": WEAKER_TEST });
    const result = await steps.green("1.1");
    expect(result.json.error?.code).toBe("test-changed-after-red");
    expect(result.json.nextStep).toBe("lexforge task red --change demo --task 1.1");
  });

  it("refuses green before red", async () => {
    await steps.start("1.1");
    commitIn(steps.wt("1.1"), { "src/notes.js": IMPL });
    const result = await steps.green("1.1");
    expect(result.json.error?.code).toBe("red-missing");
    expect(result.json.nextStep).toBe("lexforge task red --change demo --task 1.1");
  });

  it("refuses a failing run", async () => {
    await steps.redDone("1.1");
    commitIn(steps.wt("1.1"), { "src/notes.js": WRONG_IMPL });
    const result = await steps.green("1.1");
    expect(result.json.error?.code).toBe("green-run-failed");
    expect(result.json.nextStep).toBe(
      "fix the implementation in the worktree, commit it, then run: lexforge task green --change demo --task 1.1",
    );
  });

  it("refuses uncommitted changes in the worktree", async () => {
    await steps.redDone("1.1");
    writeAt(steps.wt("1.1"), "src/notes.js", IMPL);
    expect((await steps.green("1.1")).json.error?.code).toBe("worktree-dirty");
  });

  it("refuses a red commit that is no longer in the history", async () => {
    await steps.redDone("1.1");
    const wt = steps.wt("1.1");
    const { git } = await import("../helpers/git-workspace.js");
    git(wt, "reset", "--hard", readTaskRecord(root, CHANGE, "1.1")!.base);
    commitIn(wt, { "src/notes.js": IMPL });
    const result = await steps.green("1.1");
    expect(result.json.error?.code).toBe("red-not-ancestor");
    expect(result.json.nextStep).toBe("lexforge task abandon --change demo --task 1.1");
  });

  it("records green on a move task without red", async () => {
    await steps.start("6.1");
    const commit = commitIn(steps.wt("6.1"), { "src/search-helpers.js": "export {};\n" });
    writeAt(root, "lexforge/changes/demo/tasks/6.1/report.md", "moved");
    const result = await steps.green("6.1");
    expect(result.exitCode).toBe(0);
    expect(readTaskRecord(root, CHANGE, "6.1")!.green!.commit).toBe(commit);
    expect(head(steps.wt("6.1"))).toBe(commit);
  });

  it("a re-review package shows only the patch since the reviewed green", async () => {
    await steps.reviewed("1.1", "changes-requested", ["- important: no empty query"]);
    commitIn(steps.wt("1.1"), { "src/notes.js": FIXED_IMPL });
    expect((await steps.green("1.1")).exitCode).toBe(0);
    expect(readFileSync(steps.reviewMd("1.1"), "utf8")).toMatch(/## Since the last review[\s\S]*FIXED/);
  });
});
