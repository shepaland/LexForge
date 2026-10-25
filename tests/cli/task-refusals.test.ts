import { rmSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { DEV } from "../../src/core/git/feature-branch.js";
import { taskRecordPath } from "../../src/core/tasks/paths.js";
import { readTaskRecord, writeTaskRecord } from "../../src/core/tasks/records.js";
import { git, writeAt, type GitWorkspace } from "../helpers/git-workspace.js";
import { deadPid, writeLock } from "../helpers/lock.js";
import {
  CHANGE,
  CHANGE_DIR,
  cli,
  commitIn,
  commitOnChangeBranch,
  createTaskWorkspace,
  FAILING_TEST,
  FIXED_IMPL,
  IMPL,
  IMPORTS_MISSING_PACKAGE,
  PASSING_TEST,
  pointRedRecordAtCodeCommit,
  report,
  TASKS,
  taskSteps,
  WEAKER_TEST,
  WRONG_IMPL,
  type CliCall,
  type TaskOptions,
} from "../helpers/task-workspace.js";

type Steps = ReturnType<typeof taskSteps>;
interface Scenario {
  tasks?: string;
  options?: TaskOptions;
  provoke: (s: Steps, root: string) => Promise<CliCall>;
}

const lockedBy = (pid: number) => ({ pid, startedAt: new Date().toISOString(), command: "task close" });
const NO_COMMAND = TASKS.replace("Command: `node --test test/notes.test.mjs`", "Check: by hand");

async function closed(s: Steps, id: string): Promise<void> {
  await s.approvedReview(id);
  expect((await s.close(id)).exitCode).toBe(0);
}

const SCENARIOS: Record<string, Scenario> = {
  "executor-missing": { provoke: (s) => s.start("1.1", " ") },
  "task-not-found": { provoke: (s) => s.start("9.9") },
  "task-already-started": { provoke: async (s) => (await s.start("1.1"), s.start("1.1")) },
  "plan-not-approved": { options: { approved: false }, provoke: (s) => s.start("1.1") },
  "plan-changed": {
    provoke: (s, root) => (
      writeAt(root, `${CHANGE_DIR}/tasks.md`, TASKS.replace("Rank search results", "Rank the results")), s.start("1.1")
    ),
  },
  "task-dependencies-open": { provoke: (s) => s.start("1.2") },
  "task-files-overlap": { provoke: async (s) => (await s.start("2.1"), s.start("3.1")) },
  "task-worktree-exists": {
    provoke: async (s, root) => {
      await s.start("1.1");
      rmSync(taskRecordPath(root, CHANGE, "1.1"));
      return s.start("1.1");
    },
  },
  "worktree-setup-failed": { options: { setup: 'node -e "process.exit(4)"' }, provoke: (s) => s.start("1.1") },
  "change-locked": { provoke: (s, root) => (writeLock(root, CHANGE, lockedBy(process.pid)), s.start("1.1")) },
  "stale-lock": { provoke: (s, root) => (writeLock(root, CHANGE, lockedBy(deadPid())), s.start("1.1")) },
  "move-task-needs-no-red": { provoke: async (s) => (await s.start("6.1"), s.red("6.1")) },
  "task-not-started": { provoke: (s) => s.red("1.1") },
  "task-already-closed": { provoke: async (s) => (await closed(s, "1.1"), s.red("1.1")) },
  "task-command-missing": {
    tasks: NO_COMMAND,
    provoke: async (s) => {
      await s.start("1.1");
      commitIn(s.wt("1.1"), { "test/notes.test.mjs": FAILING_TEST });
      return s.red("1.1");
    },
  },
  "worktree-dirty": {
    provoke: async (s) => (await s.start("1.1"), writeAt(s.wt("1.1"), "test/notes.test.mjs", FAILING_TEST), s.red("1.1")),
  },
  "red-commit-missing": { provoke: async (s) => (await s.start("1.1"), s.red("1.1")) },
  "red-commit-touches-code": {
    provoke: async (s) => {
      await s.start("1.1");
      commitIn(s.wt("1.1"), { "test/notes.test.mjs": FAILING_TEST, "src/notes.js": IMPL });
      return s.red("1.1");
    },
  },
  "red-run-passed": {
    provoke: async (s) => (await s.start("1.1"), commitIn(s.wt("1.1"), { "test/notes.test.mjs": PASSING_TEST }), s.red("1.1")),
  },
  "red-run-broken": {
    provoke: async (s) => {
      await s.start("5.1");
      commitIn(s.wt("5.1"), { "test/needs-pkg.mjs": IMPORTS_MISSING_PACKAGE });
      return s.red("5.1");
    },
  },
  "red-missing": {
    provoke: async (s) => (await s.start("1.1"), commitIn(s.wt("1.1"), { "src/notes.js": IMPL }), s.green("1.1")),
  },
  "red-not-ancestor": {
    provoke: async (s, root) => {
      await s.redDone("1.1");
      git(s.wt("1.1"), "reset", "--hard", readTaskRecord(root, CHANGE, "1.1")!.base);
      commitIn(s.wt("1.1"), { "src/notes.js": IMPL });
      return s.green("1.1");
    },
  },
  "test-changed-after-red": {
    provoke: async (s) => (await s.redDone("1.1"), commitIn(s.wt("1.1"), { "test/notes.test.mjs": WEAKER_TEST }), s.green("1.1")),
  },
  "executor-report-missing": {
    provoke: async (s) => {
      await s.redDone("1.1");
      commitIn(s.wt("1.1"), { "src/notes.js": IMPL });
      rmSync(s.reportMd("1.1"));
      return s.green("1.1");
    },
  },
  "green-run-failed": {
    provoke: async (s) => (await s.redDone("1.1"), commitIn(s.wt("1.1"), { "src/notes.js": WRONG_IMPL }), s.green("1.1")),
  },
  "green-missing": { provoke: async (s) => (await s.redDone("1.1"), s.review("1.1", report())) },
  "reviewer-is-executor": {
    provoke: async (s) => (await s.greenDone("1.1"), s.review("1.1", report({ reviewer: "exec-1" }))),
  },
  "control-not-confirmed": { provoke: async (s) => (await s.greenDone("7.1"), s.review("7.1", report())) },
  "review-report-unreadable": {
    provoke: async (s) => {
      await s.greenDone("1.1");
      const file = report();
      writeFileSync(file, "looks fine to me\n");
      return s.review("1.1", file);
    },
  },
  "change-branch-not-checked-out": {
    provoke: async (s, root) => (await s.approvedReview("1.1"), git(root, "checkout", DEV), s.close("1.1")),
  },
  "task-commit-missing": {
    provoke: async (s, root) => {
      await s.approvedReview("1.1");
      writeTaskRecord(root, CHANGE, { ...readTaskRecord(root, CHANGE, "1.1")!, base: "1".repeat(40) });
      return s.close("1.1");
    },
  },
  "code-before-red": {
    provoke: async (s, root) => (await s.approvedReview("1.1"), pointRedRecordAtCodeCommit(root, "1.1"), s.close("1.1")),
  },
  "undeclared-file": {
    provoke: async (s) => (await s.approvedReview("1.1"), commitIn(s.wt("1.1"), { "src/other.js": "x" }), s.close("1.1")),
  },
  "review-stale": {
    provoke: async (s) => (await s.approvedReview("1.1"), commitIn(s.wt("1.1"), { "src/notes.js": FIXED_IMPL }), s.close("1.1")),
  },
  "findings-open": {
    provoke: async (s) => (await s.reviewed("1.1", "approved", ["- important: x"]), s.close("1.1")),
  },
  "merge-conflict": {
    provoke: async (s, root) => (await s.approvedReview("1.1"), commitOnChangeBranch(root, { "src/notes.js": "conflict\n" }), s.close("1.1")),
  },
  "abandon: task-not-started": { provoke: (s) => s.abandon("1.1") },
};

let ws: GitWorkspace | undefined;
afterEach(() => ws?.remove());

describe("every refusal of a task command", { timeout: 30_000 }, () => {
  it.each(Object.keys(SCENARIOS))("%s names a next step that is a command", async (name) => {
    const scenario = SCENARIOS[name]!;
    ws = createTaskWorkspace(scenario.tasks, scenario.options);
    const result = await scenario.provoke(taskSteps(ws.root), ws.root);
    expect(result.exitCode).toBe(2);
    expect(result.json.error?.code).toBe(name.replace(/^abandon: /, ""));
    expect(result.json.error?.message).not.toBe("");
    expect(result.json.nextStep).toMatch(/(^lexforge |run: lexforge |^git )/);
    expect(result.json.nextStep).not.toMatch(/\.json\b|\.lock\b|execution\//);
  });
});

it("unlock is a command a refusal can name", async () => {
  ws = createTaskWorkspace();
  expect((await cli(ws.root, ["unlock", "--change", CHANGE, "--json"])).exitCode).toBe(0);
});
