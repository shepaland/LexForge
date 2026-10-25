import { afterEach, describe, expect, it } from "vitest";
import { UsageError } from "../../../src/cli/errors.js";
import { verifyChange } from "../../../src/core/gates/verify-change.js";
import { readPlanState, writePlanState } from "../../../src/core/tasks/plan-state.js";
import { listTaskRecords } from "../../../src/core/tasks/records.js";
import { createMigratedChangeAllClosed, createTwoTaskChange } from "../../helpers/final-review-fixture.js";
import { git, writeAt, type GitWorkspace } from "../../helpers/git-workspace.js";
import { createShortWorkspace } from "../../helpers/short-workspace.js";
import { CHANGE } from "../../helpers/task-workspace.js";

let ws: GitWorkspace | undefined;
afterEach(() => ws?.remove());

function withChecks(created: GitWorkspace): string {
  ws = created;
  writeAt(ws.root, "lexforge/config.yaml", 'schema: spec-driven\nverification:\n  tests: node -e ""\nengineering:\n  stacks: []\n');
  return ws.root;
}

function refusal(root: string): UsageError {
  try {
    verifyChange({ cwd: root, change: CHANGE });
  } catch (error) {
    if (error instanceof UsageError) return error;
    throw error;
  }
  throw new Error("verify did not refuse");
}

describe("verify refuses a change it has no base for", { timeout: 60_000 }, () => {
  it("refuses a full-path change without an approved plan and names plan approve", () => {
    const root = withChecks(createTwoTaskChange());
    writePlanState(root, CHANGE, { ...readPlanState(root, CHANGE), approval: null });
    const error = refusal(root);
    expect(error.code).toBe("plan-not-approved");
    expect(error.message).not.toContain("final review");
    expect(error.nextStep).toBe(`lexforge plan approve --change demo --quote "<owner's words>"`);
  });

  it("refuses a short change whose task has not started and names task start with an executor", () => {
    const root = withChecks(createShortWorkspace());
    const error = refusal(root);
    expect(error.code).toBe("short-path-not-started");
    expect(error.message).not.toContain("final review");
    expect(error.nextStep).toContain("lexforge task start --change demo --task 1.1 --executor");
  });

  it("refuses a migrated change without dev and leads back into verify", () => {
    const root = withChecks(createMigratedChangeAllClosed());
    git(root, "branch", "-D", "dev");
    const error = refusal(root);
    expect(error.code).toBe("dev-branch-missing");
    expect(error.nextStep).toBe("git branch dev main, then run: lexforge verify --change demo");
  });

  it("leaves an unrelated dev in place and names a step that keeps its commits", () => {
    const root = withChecks(createMigratedChangeAllClosed());
    const emptyTree = git(root, "hash-object", "-t", "tree", "/dev/null");
    git(root, "branch", "--force", "dev", git(root, "commit-tree", emptyTree, "-m", "unrelated"));
    const dev = git(root, "rev-parse", "dev");
    const error = refusal(root);
    expect(error.code).toBe("dev-branch-missing");
    expect(error.nextStep).not.toContain("--force");
    expect(error.nextStep).toBe(
      "git checkout feature/demo && git merge --allow-unrelated-histories --no-edit dev, then run: lexforge verify --change demo",
    );
    git(root, "merge", "--allow-unrelated-histories", "--no-edit", "dev");
    expect(git(root, "rev-parse", "dev")).toBe(dev);
    expect(() => verifyChange({ cwd: root, change: CHANGE })).not.toThrow();
  });

  it("refuses a migrated change without its branch before looking for a merge-base", () => {
    const root = withChecks(createMigratedChangeAllClosed());
    const merge = listTaskRecords(root, CHANGE).at(-1)!.closed!.merge;
    git(root, "checkout", "--detach");
    git(root, "branch", "-D", "feature/demo");
    const error = refusal(root);
    expect(error.code).toBe("change-branch-missing");
    expect(error.nextStep).toBe(`git branch feature/demo ${merge}, then run: lexforge verify --change demo`);
  });
});
