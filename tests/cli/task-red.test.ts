import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readTaskRecord } from "../../src/core/tasks/records.js";
import { writeAt, type GitWorkspace } from "../helpers/git-workspace.js";
import {
  CHANGE,
  CHANGE_DIR,
  commitIn,
  createTaskWorkspace,
  FAILING_TEST,
  head,
  IMPL,
  IMPORTS_MISSING_PACKAGE,
  PASSING_TEST,
  taskSteps,
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

describe("lexforge task red", () => {
  it("records red on a commit that holds the test only", async () => {
    await steps.start("1.1");
    const wt = steps.wt("1.1");
    commitIn(wt, { "test/notes.test.mjs": FAILING_TEST });
    const result = await steps.red("1.1");
    expect(result.exitCode).toBe(0);
    const record = readTaskRecord(root, CHANGE, "1.1")!;
    expect(record.red).toMatchObject({ commit: head(wt), exitCode: 1 });
    expect(record.red!.log).toBe(`${CHANGE_DIR}/tasks/1.1/red.log`);
    expect(readFileSync(path.join(root, record.red!.log), "utf8")).toContain("search");
    expect(result.json.data?.nextStep).toBe(
      "commit the implementation, then run: lexforge task green --change demo --task 1.1",
    );
  });

  it("refuses a red commit that also touches code", async () => {
    await steps.start("1.1");
    commitIn(steps.wt("1.1"), { "test/notes.test.mjs": FAILING_TEST, "src/notes.js": IMPL });
    const result = await steps.red("1.1");
    expect(result.json.error).toMatchObject({ code: "red-commit-touches-code", message: expect.stringContaining("src/notes.js") });
    expect(result.json.nextStep).toBe("lexforge task abandon --change demo --task 1.1");
  });

  it("refuses a test that already passes", async () => {
    await steps.start("1.1");
    commitIn(steps.wt("1.1"), { "test/notes.test.mjs": PASSING_TEST });
    const result = await steps.red("1.1");
    expect(result.json.error?.code).toBe("red-run-passed");
    expect(result.json.nextStep).toBe(
      "make the test fail on the missing behaviour, commit it, then run: lexforge task red --change demo --task 1.1",
    );
    expect(readTaskRecord(root, CHANGE, "1.1")!.red).toBeNull();
  });

  it("refuses uncommitted changes in the worktree", async () => {
    await steps.start("1.1");
    writeAt(steps.wt("1.1"), "test/notes.test.mjs", FAILING_TEST);
    const result = await steps.red("1.1");
    expect(result.json.error?.code).toBe("worktree-dirty");
    expect(result.json.nextStep).toBe("git -C " + steps.wt("1.1") + " status");
  });

  it("refuses a broken run in a fresh worktree without dependencies", async () => {
    await steps.start("5.1");
    commitIn(steps.wt("5.1"), { "test/needs-pkg.mjs": IMPORTS_MISSING_PACKAGE });
    const result = await steps.red("5.1");
    expect(result.json.error).toMatchObject({ code: "red-run-broken", message: expect.stringContaining("worktree.setup") });
    expect(result.json.nextStep).toBe(
      "set worktree.setup in lexforge/config.yaml, then run: lexforge task abandon --change demo --task 5.1",
    );
  });

  it("refuses red on a move task", async () => {
    const result = await steps.red("6.1");
    expect(result.json.error?.code).toBe("move-task-needs-no-red");
    expect(result.json.nextStep).toBe("lexforge task green --change demo --task 6.1");
  });

  it("refuses a task that has not started", async () => {
    const result = await steps.red("4.1");
    expect(result.json.error?.code).toBe("task-not-started");
    expect(result.json.nextStep).toBe("lexforge task start --change demo --task 4.1 --executor <id>");
  });

  it("a second red on a new test commit replaces the first", async () => {
    await steps.redDone("1.1");
    const first = readTaskRecord(root, CHANGE, "1.1")!.red!.commit;
    const again = commitIn(steps.wt("1.1"), { "test/notes.test.mjs": `${FAILING_TEST}// again\n` });
    expect((await steps.red("1.1")).exitCode).toBe(0);
    const record = readTaskRecord(root, CHANGE, "1.1")!;
    expect(record.red!.commit).toBe(again);
    expect(record.red!.commit).not.toBe(first);
    expect(record.green).toBeNull();
  });

  it("refuses red once the implementation is committed", async () => {
    await steps.greenDone("1.1");
    commitIn(steps.wt("1.1"), { "test/notes.test.mjs": `${FAILING_TEST}// again\n` });
    expect((await steps.red("1.1")).json.error?.code).toBe("red-commit-touches-code");
    expect(existsSync(path.join(root, CHANGE_DIR, "tasks/1.1/green.log"))).toBe(true);
  });
});
