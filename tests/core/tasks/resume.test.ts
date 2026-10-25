import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addEntry, openSession, resolveEntry } from "../../../src/core/tasks/journal.js";
import { finalReviewPath } from "../../../src/core/tasks/paths.js";
import { planDigest, readPlanState, writePlanState } from "../../../src/core/tasks/plan-state.js";
import { resume } from "../../../src/core/tasks/resume.js";
import { writeWorkflowFile } from "../../../src/core/tasks/workflow-file.js";
import { createGitWorkspace, writeAt, type GitWorkspace } from "../../helpers/git-workspace.js";
import { appendTask, CHANGE, CHANGE_DIR, cli, edit, planFiles } from "../../helpers/plan-fixture.js";
import { ANGLES_FOR_TESTS, putRecord, review, RUN } from "../../helpers/resume-fixture.js";

let ws: GitWorkspace;
let root: string;

beforeEach(() => {
  ws = createGitWorkspace(planFiles());
  root = ws.root;
  writeWorkflowFile(root, CHANGE, { version: 3, schema: "spec-driven", schemaVersion: 1, path: "full" });
});
afterEach(() => ws.remove());

function setupUnreviewed(): void {}

function setupReviewed(): void {
  const state = readPlanState(root, CHANGE);
  const digest = planDigest(root, CHANGE);
  state.reviews = ANGLES_FOR_TESTS.map((angle) => ({
    angle, reviewer: "r", verdict: "approved" as const, findings: [], digest, file: "r.md", at: "2026-10-22T10:00:00.000Z",
  }));
  writePlanState(root, CHANGE, state);
}

function setupApproved(): void {
  setupReviewed();
  const state = readPlanState(root, CHANGE);
  state.approval = {
    quote: "да", digest: planDigest(root, CHANGE), base: "abc", taskTexts: {}, at: "2026-10-22T10:00:00.000Z",
  };
  writePlanState(root, CHANGE, state);
}

function setupRedDone(): void {
  setupApproved();
  putRecord(root, "1.1", { red: RUN("aaa") });
}

function setupOpenQuestion(): void {
  addEntry(root, CHANGE, { kind: "question", text: "Which sort?" });
}

function setupAllClosed(): void {
  setupApproved();
  for (const id of ["1.1", "1.2", "2.1"]) putRecord(root, id, { closed: { merge: "m", at: "2026-10-22T11:00:00.000Z" } });
}

describe("resume nextStep", () => {
  it.each([
    ["plan not reviewed", setupUnreviewed, "lexforge plan review --change demo --angle specs --file <report.md>"],
    ["reviewed, not approved", setupReviewed, "lexforge plan approve --change demo --quote \"<owner's words>\""],
    ["approved, nothing started", setupApproved, "lexforge task start --change demo --task 1.1 --executor <id>"],
    ["task waits for green", setupRedDone, "commit the implementation, then run: lexforge task green --change demo --task 1.1"],
    [
      "open question",
      setupOpenQuestion,
      "ask the owner J1, then run: lexforge journal resolve --change demo --id J1 --note \"<answer>\"",
    ],
    ["all closed", setupAllClosed, "lexforge review final --change demo --file <report.md>"],
  ])("%s → next step", (_name, setup, next) => {
    setup();
    expect(resume(root, CHANGE).nextStep).toBe(next);
  });

  it("a resolved question stops being the next step", () => {
    setupApproved();
    setupOpenQuestion();
    resolveEntry(root, CHANGE, "J1", "by title");
    expect(resume(root, CHANGE).nextStep).toBe("lexforge task start --change demo --task 1.1 --executor <id>");
  });

  it("asks for a red run of a task that has none", () => {
    setupApproved();
    putRecord(root, "1.1", {});
    expect(resume(root, CHANGE).nextStep).toBe(
      "commit the failing test, then run: lexforge task red --change demo --task 1.1",
    );
  });

  it("sends a green task to a reviewer, then closes it once the review approves the green commit", () => {
    setupApproved();
    putRecord(root, "1.1", { red: RUN("aaa"), green: RUN("bbb") });
    expect(resume(root, CHANGE).nextStep).toBe(
      "send lexforge/changes/demo/tasks/1.1/review.md to a reviewer, then run: " +
        "lexforge task review --change demo --task 1.1 --file <report.md>",
    );
    putRecord(root, "1.1", { red: RUN("aaa"), green: RUN("bbb"), reviews: [review("bbb", "approved")] });
    expect(resume(root, CHANGE).nextStep).toBe("lexforge task close --change demo --task 1.1");
  });

  it("a review of an older green commit does not approve the current one", () => {
    setupApproved();
    putRecord(root, "1.1", { red: RUN("aaa"), green: RUN("ccc"), reviews: [review("bbb", "approved")] });
    expect(resume(root, CHANGE).running).toEqual([{ task: "1.1", stage: "review", worktree: "/nowhere" }]);
  });

  it("a review that requests changes sends the task back to green", () => {
    setupApproved();
    putRecord(root, "1.1", { red: RUN("aaa"), green: RUN("bbb"), reviews: [review("bbb", "changes-requested")] });
    expect(resume(root, CHANGE).nextStep).toBe(
      "fix the findings in the worktree, commit, then run: lexforge task green --change demo --task 1.1",
    );
  });

  it("names the amendment steps once the approved plan changed", () => {
    setupApproved();
    edit(root, "1.1", "renamed");
    expect(resume(root, CHANGE).nextStep).toBe("lexforge plan amend --change demo --quote \"<owner's words>\"");
  });

  function finalReview(verdict: "approved" | "changes-requested", level?: "critical" | "minor"): void {
    const findings = level === undefined ? [] : [{ id: "F1", level, message: "x" }];
    const entry = { reviewer: "final-1", verdict, head: "h", base: "b", findings, at: "2026-10-22T12:00:00.000Z" };
    writeAt(root, finalReviewPath(root, CHANGE).slice(root.length + 1), JSON.stringify({ version: 1, reviews: [entry] }));
  }

  it("asks for the verdict after an approved final review", () => {
    setupAllClosed();
    finalReview("approved", "minor");
    expect(resume(root, CHANGE).nextStep).toBe("lexforge verify --change demo");
  });

  it.each<["approved" | "changes-requested", "critical" | undefined]>([
    ["changes-requested", undefined],
    ["approved", "critical"],
  ])("a final review %s with %s finding names a new task, not verify", (verdict, level) => {
    setupAllClosed();
    finalReview(verdict, level);
    expect(resume(root, CHANGE).nextStep).toBe(
      "add a task for each finding, then run: lexforge plan amend --change demo --quote \"<owner's words>\"",
    );
  });

  it("a short change skips the plan review and the approval", () => {
    writeWorkflowFile(root, CHANGE, { version: 3, schema: "spec-driven", schemaVersion: 1, path: "short" });
    expect(resume(root, CHANGE).nextStep).toBe("lexforge task start --change demo --task 1.1 --executor <id>");
  });

  it("refuses a change that predates workflow 3 with the migrate command", () => {
    writeAt(root, `${CHANGE_DIR}/workflow.json`, JSON.stringify({ version: 2, schema: "spec-driven", schemaVersion: 1 }));
    expect(() => resume(root, CHANGE)).toThrowError(
      expect.objectContaining({ code: "change-needs-migration", nextStep: "lexforge migrate --change demo" }),
    );
  });

  it("points a change without a plan at its next artifact", () => {
    const bare = createGitWorkspace({
      [`${CHANGE_DIR}/.lexforge.yaml`]: "schema: spec-driven\n",
    });
    try {
      writeWorkflowFile(bare.root, CHANGE, { version: 3, schema: "spec-driven", schemaVersion: 1, path: "full" });
      expect(resume(bare.root, CHANGE).nextStep).toBe("lexforge instructions proposal --change demo");
    } finally {
      bare.remove();
    }
  });
});

describe("resume journal", () => {
  it("lists active permissions only, with their scope", () => {
    setupApproved();
    addEntry(root, CHANGE, { kind: "permission", text: "edit config", quote: "можно" });
    addEntry(root, CHANGE, { kind: "permission", text: "touch x", quote: "да", scope: "task:1.1" });
    openSession(root, CHANGE);
    addEntry(root, CHANGE, { kind: "permission", text: "one session", quote: "ок", scope: "session" });
    putRecord(root, "1.1", { closed: { merge: "m", at: "2026-10-22T11:00:00.000Z" } });
    expect(resume(root, CHANGE).permissions.map((e) => e.id)).toEqual(["J1", "J3"]);
    openSession(root, CHANGE);
    expect(resume(root, CHANGE).permissions.map((e) => e.id)).toEqual(["J1"]);
  });

  it("keeps unresolved promises and every decision with its quote", () => {
    setupApproved();
    addEntry(root, CHANGE, { kind: "decision", text: "Keep it", quote: "да, ровно то" });
    addEntry(root, CHANGE, { kind: "promise", text: "Document it" });
    addEntry(root, CHANGE, { kind: "promise", text: "Done already" });
    resolveEntry(root, CHANGE, "J3", "documented");
    addEntry(root, CHANGE, { kind: "ruling", text: "Sort by title", reason: "titles are unique" });
    expect(resume(root, CHANGE)).toMatchObject({
      promises: [{ id: "J2", resolved: null }],
      decisions: [{ quote: "да, ровно то" }],
      rulings: [{ reason: "titles are unique" }],
    });
  });

  it("counts the progress of the plan", () => {
    setupApproved();
    appendTask(root, "2.1");
    putRecord(root, "1.1", { closed: { merge: "m", at: "2026-10-22T11:00:00.000Z" } });
    expect(resume(root, CHANGE).progress).toMatchObject({ total: 4, closed: 1 });
  });
});

describe("lexforge resume", () => {
  it("prints the next step on top level and the journal in the data", async () => {
    setupOpenQuestion();
    const result = await cli(root, ["resume", "--change", CHANGE]);
    expect(result.exitCode).toBe(0);
    expect(result.json.data).toMatchObject({ change: "demo", questions: [{ id: "J1" }] });
    expect(result.json.data?.nextStep).toContain("journal resolve");
  });

  it("is the only resume: the old continuation is gone", async () => {
    setupOpenQuestion();
    const result = await cli(root, ["resume", "--change", CHANGE]);
    expect(result.json.data).not.toHaveProperty("continuation");
  });
});
