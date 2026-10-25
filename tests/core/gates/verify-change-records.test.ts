import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UsageError } from "../../../src/cli/errors.js";
import { verifyChange } from "../../../src/core/gates/verify-change.js";
import { taskFindings } from "../../../src/core/gates/verify-change-tasks.js";
import { registerFinalReview } from "../../../src/core/tasks/final-review.js";
import { finalReviewPath } from "../../../src/core/tasks/paths.js";
import { readPlanState } from "../../../src/core/tasks/plan-state.js";
import { readTaskRecord, writeTaskRecord, type TaskRecord } from "../../../src/core/tasks/records.js";
import { createTwoTaskChange, twoTaskSteps } from "../../helpers/final-review-fixture.js";
import { git, writeAt, type GitWorkspace } from "../../helpers/git-workspace.js";
import { CHANGE, commitOnChangeBranch, expectOk, report } from "../../helpers/task-workspace.js";
import { yieldEventLoop } from "./verify-change-fixtures.js";

let ws: GitWorkspace | undefined;
let root: string;
afterEach(() => ws?.remove());
afterEach(yieldEventLoop);

beforeEach(async () => {
  ws = createTwoTaskChange();
  root = ws.root;
  const steps = twoTaskSteps(root);
  await steps.approved("1.2", "exec-2");
  expectOk(await steps.close("1.2"), "close 1.2");
  await steps.closed("1.1", "exec-1");
  registerFinalReview(root, CHANGE, report({ reviewer: "final-1", verdict: "approved" }));
}, 60_000);

function rewriteRecord(id: string, change: (record: TaskRecord) => TaskRecord): void {
  writeTaskRecord(root, CHANGE, change(readTaskRecord(root, CHANGE, id)!));
}

function lastReview(record: TaskRecord, patch: Partial<TaskRecord["reviews"][number]>): TaskRecord {
  const reviews = record.reviews.slice(0, -1);
  return { ...record, reviews: [...reviews, { ...record.reviews.at(-1)!, ...patch }] };
}

const rules = (): string[] => taskFindings(root, CHANGE).map((f) => f.rule);
const messages = (): string[] => taskFindings(root, CHANGE).map((f) => f.message);

describe("taskFindings: the review a closed record carries", { timeout: 60_000 }, () => {
  it.each<[string, (record: TaskRecord) => TaskRecord]>([
    ["no review at all", (r) => ({ ...r, reviews: [] })],
    ["a review by the executor", (r) => lastReview(r, { reviewer: r.executor })],
    ["a review asking for changes", (r) => lastReview(r, { verdict: "changes-requested" })],
    ["a review of another commit", (r) => lastReview(r, { green: r.base })],
    [
      "an approval with an important finding",
      (r) => lastReview(r, { findings: [{ id: "F1", level: "important", message: "x" }] }),
    ],
  ])("finds a closed record with %s", (_, spoil) => {
    rewriteRecord("1.2", spoil);
    expect(rules()).toEqual(["task-not-reviewed"]);
    expect(messages()[0]).toContain("Run: lexforge task review --change demo --task 1.2 --file <report.md>");
  });

  it("lets a minor finding of an approved review through", () => {
    rewriteRecord("1.2", (r) => lastReview(r, { findings: [{ id: "F1", level: "minor", message: "x" }] }));
    expect(rules()).toEqual([]);
  });
});

describe("taskFindings: work the change branch lacks", { timeout: 60_000 }, () => {
  it("finds an untracked file outside lexforge/", () => {
    writeAt(root, "src/extra.js", "export const extra = 1;\n");
    expect(rules()).toEqual(["uncommitted-work"]);
    expect(messages()[0]).toContain("src/extra.js");
    expect(messages()[0]).toContain("lexforge review final --change demo");
  });

  it("finds an edit of a tracked file outside lexforge/", () => {
    writeFileSync(path.join(root, "src/notes.js"), "export const changed = 1;\n");
    expect(rules()).toEqual(["uncommitted-work"]);
  });

  it("finds a staged edit outside lexforge/", () => {
    writeAt(root, "src/staged.js", "1\n");
    git(root, "add", "src/staged.js");
    expect(rules()).toEqual(["uncommitted-work"]);
  });

  it("leaves the directory of the change to the change itself", () => {
    writeAt(root, "lexforge/changes/demo/notes.md", "draft\n");
    expect(rules()).toEqual([]);
  });

  it("leaves the defect ledger that defect record writes", () => {
    writeAt(root, "lexforge/defects.json", "[]\n");
    expect(rules()).toEqual([]);
  });

  it("leaves the task worktrees under .lexforge/worktrees/", () => {
    writeAt(root, ".lexforge/worktrees/other/1.1/src/x.js", "1\n");
    expect(rules()).toEqual([]);
  });

  it("leaves the lock and temporary files of the defect ledger", () => {
    writeAt(root, "lexforge/defects.json.lock", "1\n");
    writeAt(root, "lexforge/defects.json.tmp", "1\n");
    expect(rules()).toEqual([]);
  });

  it("finds a file that only starts like the defect ledger", () => {
    writeAt(root, "lexforge/defects.json.bak", "[]\n");
    expect(rules()).toEqual(["uncommitted-work"]);
  });

  it("finds an edit of a delta spec of the change", () => {
    writeAt(root, "lexforge/changes/demo/specs/notes/spec.md", "## ADDED Requirements\n");
    expect(rules()).toEqual(["uncommitted-work"]);
    expect(messages()[0]).toContain("lexforge/changes/demo/specs/notes/spec.md");
  });

  it("finds an untracked main spec", () => {
    writeAt(root, "lexforge/specs/billing/spec.md", "# billing\n");
    expect(rules()).toEqual(["uncommitted-work"]);
    expect(messages()[0]).toContain("lexforge/specs/billing/spec.md");
  });

  it("finds an edit of lexforge/config.yaml", () => {
    writeAt(root, "lexforge/config.yaml", "schema: spec-driven\nverification:\n  tests: node -e \"\"\n");
    expect(rules()).toEqual(["uncommitted-work"]);
    expect(messages()[0]).toContain("lexforge/config.yaml");
  });

  it("finds a file under another change", () => {
    writeAt(root, "lexforge/changes/other/proposal.md", "## Why\n");
    expect(rules()).toEqual(["uncommitted-work"]);
  });
});

describe("taskFindings: a working tree on another branch", { timeout: 60_000 }, () => {
  beforeEach(() => {
    git(root, "checkout", "--quiet", "-b", "other", readPlanState(root, CHANGE).approval!.base);
  });

  it("does not list files the change branch already holds", () => {
    expect(rules()).toEqual([]);
  });

  it("names checking out the change branch for work left in the tree", () => {
    writeAt(root, "src/extra.js", "export const extra = 1;\n");
    expect(rules()).toEqual(["uncommitted-work"]);
    expect(messages()[0]).toContain("src/extra.js");
    expect(messages()[0]).not.toContain("src/rank.js");
    expect(messages()[0]).toContain("git checkout feature/demo");
  });
});

describe("taskFindings: each finding names its way out", { timeout: 60_000 }, () => {
  it("names review final for a stale final review", () => {
    commitOnChangeBranch(root, { "src/late.js": "late\n" });
    expect(messages()).toEqual([expect.stringContaining("Run: lexforge review final --change demo")]);
  });

  it("names review final for a missing final review", () => {
    rmSync(finalReviewPath(root, CHANGE));
    expect(messages()).toEqual([expect.stringContaining("Run: lexforge review final --change demo")]);
  });

  it("names plan amend for a final review with open findings", () => {
    registerFinalReview(root, CHANGE, report({ reviewer: "final-2", verdict: "changes-requested", findings: ["- critical: x"] }));
    expect(messages()).toEqual([expect.stringContaining("lexforge plan amend --change demo")]);
  });

  it("names the reflog and verify for a commit the branch lost", () => {
    const merge = readTaskRecord(root, CHANGE, "1.1")!.closed!.merge;
    git(root, "reset", "--soft", `${merge}^1`);
    git(root, "commit", "--message", "task 1.1 squashed");
    const missing = taskFindings(root, CHANGE).find((f) => f.rule === "recorded-commit-missing");
    expect(missing?.message).toContain("git reflog show feature/demo");
    expect(missing?.message).toContain("lexforge verify --change demo");
  });

  it("refuses a missing change branch with the commit of the last close", () => {
    const merge = readTaskRecord(root, CHANGE, "1.1")!.closed!.merge;
    git(root, "checkout", "--detach");
    git(root, "branch", "-D", "feature/demo");
    let refusal: unknown;
    try {
      taskFindings(root, CHANGE);
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(UsageError);
    expect(refusal).toMatchObject({
      code: "change-branch-missing",
      nextStep: `git branch feature/demo ${merge}, then run: lexforge verify --change demo`,
    });
  });
});

describe("verify: the summary counts each finding under its own key", { timeout: 60_000 }, () => {
  it("counts an unreviewed task and uncommitted work apart from closed records and the final review", () => {
    writeAt(root, "lexforge/config.yaml", 'schema: spec-driven\nverification:\n  tests: node -e ""\nengineering:\n  stacks: []\n');
    rewriteRecord("1.2", (r) => ({ ...r, reviews: [] }));
    expect(verifyChange({ cwd: root, change: CHANGE }).data.summary).toMatchObject({
      tasksNotReviewed: 1,
      uncommittedWork: 1,
      tasksWithoutClosedRecord: 0,
      finalReview: 0,
    });
  });
});
