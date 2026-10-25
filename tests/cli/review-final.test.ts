import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { readFinalReviews } from "../../src/core/tasks/final-review.js";
import { readPlanState, writePlanState } from "../../src/core/tasks/plan-state.js";
import { readTaskRecord } from "../../src/core/tasks/records.js";
import { git, type GitWorkspace } from "../helpers/git-workspace.js";
import {
  createMigratedChangeAllClosed,
  createTwoTaskChange,
  finalReviewPackage as packageOf,
  twoTaskSteps,
} from "../helpers/final-review-fixture.js";
import { CHANGE, cli, report } from "../helpers/task-workspace.js";

let ws: GitWorkspace | undefined;
let root: string;
afterEach(() => ws?.remove());

const run = (argv: string[]) => cli(root, argv);
const final = (file: string) => run(["review", "final", "--change", CHANGE, "--file", file, "--json"]);
const close = (id: string) => twoTaskSteps(root).close(id);
const finalReviewPackage = () => packageOf(root);

function twoTasks(): ReturnType<typeof twoTaskSteps> {
  ws = createTwoTaskChange();
  root = ws.root;
  return twoTaskSteps(root);
}

async function approvedChangeWithOpenTask(): Promise<void> {
  await twoTasks().closed("1.1");
}

async function lastTaskApproved(): Promise<void> {
  const steps = twoTasks();
  await steps.closed("1.1", "exec-1");
  await steps.approved("1.2", "exec-2");
}

async function allTasksClosed(): Promise<void> {
  await lastTaskApproved();
  const closed = await close("1.2");
  if (closed.exitCode !== 0) throw new Error(`close 1.2 failed: ${JSON.stringify(closed.json)}`);
}

async function migratedChangeAllClosedHistorically(): Promise<void> {
  ws = createMigratedChangeAllClosed();
  root = ws.root;
}

describe("lexforge review final", { timeout: 30_000 }, () => {
  it("refuses while a task is open", async () => {
    await approvedChangeWithOpenTask();
    // The JSON envelope carries nextStep beside error, not inside it.
    expect((await final(report())).json).toMatchObject({
      error: { code: "tasks-open" },
      nextStep: "lexforge task start --change demo --task 1.2 --executor <id>",
    });
  });

  it("registers an approval against the current tip of the change branch", async () => {
    await allTasksClosed();
    const result = await final(report({ reviewer: "final-1", verdict: "approved" }));
    expect(readFinalReviews(root, "demo").at(-1)).toMatchObject({ head: git(root, "rev-parse", "feature/demo") });
    expect(result.json.data.nextStep).toBe("lexforge verify --change demo");
  });

  it("a blocking finding names a new task through plan amend", async () => {
    await allTasksClosed();
    const result = await final(report({ verdict: "changes-requested", findings: ["- important: `src/a.ts:3` x"] }));
    expect(result.json.data.nextStep).toBe(
      "add a task for each finding, then run: lexforge plan amend --change demo --quote \"<owner's words>\"",
    );
  });

  it("refuses a reviewer who executed a task of the change", async () => {
    await allTasksClosed(); // исполнитель 1.1 — exec-1
    expect((await final(report({ reviewer: "exec-1" }))).json.error.code).toBe("reviewer-is-executor");
  });

  it("task close of the last task names the final review package", async () => {
    await lastTaskApproved();
    expect((await close("1.2")).json.data.nextStep).toBe(
      "send lexforge/changes/demo/final-review.md to a reviewer, then run: lexforge review final --change demo --file <report.md>",
    );
  });

  it("task close of the last task stays done when the package cannot be written", async () => {
    await lastTaskApproved();
    writePlanState(root, CHANGE, { ...readPlanState(root, CHANGE), migratedFrom: "5.x" });
    git(root, "branch", "-D", "dev");
    const result = await close("1.2");
    expect(result.exitCode).toBe(0);
    expect(result.json.data.nextStep).toBe("git branch dev main, then run: lexforge review final --change demo");
    expect(readTaskRecord(root, CHANGE, "1.2")?.closed).not.toBeNull();
  });

  it("without --file writes the package of a migrated change against its merge-base with dev", async () => {
    await migratedChangeAllClosedHistorically();
    const result = await run(["review", "final", "--change", "demo", "--json"]);
    expect(result.json.data.nextStep).toMatch(/^send lexforge\/changes\/demo\/final-review\.md to a reviewer/);
    expect(readFileSync(finalReviewPackage(), "utf8")).toContain(git(root, "merge-base", "dev", "feature/demo"));
  });
});
