import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { git, commitAll, writeAt, type GitWorkspace } from "../helpers/git-workspace.js";
import { planDigest, readPlanState, writePlanState } from "../../src/core/tasks/plan-state.js";
import { CHANGE, allFourApproved, approveCall, createPlanWorkspace, edit, review } from "../helpers/plan-fixture.js";

let ws: GitWorkspace;
let root: string;

beforeEach(() => {
  ws = createPlanWorkspace();
  root = ws.root;
});
afterEach(() => ws.remove());

describe("lexforge plan approve", () => {
  it("records the quote, the digest and the base", async () => {
    await allFourApproved(root);
    const result = await approveCall(root, "да, делай");
    expect(result.exitCode).toBe(0);
    expect(readPlanState(root, CHANGE).approval).toMatchObject({
      quote: "да, делай",
      digest: planDigest(root, CHANGE),
      base: git(root, "rev-parse", "HEAD"),
    });
    expect(result.json.data?.nextStep).toBe("lexforge task start --change demo --task 1.1 --executor <id>");
  });

  it("refuses while an angle has not approved the current digest", async () => {
    await allFourApproved(root);
    edit(root, "1.1", "renamed");
    const result = await approveCall(root);
    expect(result.json.error).toMatchObject({
      code: "plan-reviews-missing",
      message: expect.stringContaining("specs, code, dependencies, gaps"),
    });
    expect(result.json.nextStep).toBe("lexforge plan review --change demo --angle specs --file <report.md>");
  });

  it("refuses while the latest report of an angle holds a critical or important finding", async () => {
    await allFourApproved(root);
    await review(root, "gaps", "approved", "- important: scenario Y has no task");
    const result = await approveCall(root);
    expect(result.json.error).toMatchObject({
      code: "plan-reviews-missing",
      message: expect.stringContaining("gaps"),
    });
  });

  it("refuses code written before approval", async () => {
    await allFourApproved(root);
    writeAt(root, "src/new.ts", "export {}");
    const result = await approveCall(root);
    expect(result.json.error).toMatchObject({
      code: "work-before-approval",
      message: expect.stringContaining("src/new.ts"),
    });
  });

  it("refuses a commit on the change branch that is not in dev", async () => {
    await allFourApproved(root);
    writeAt(root, "src/new.ts", "x");
    commitAll(root, "early");
    const result = await approveCall(root);
    expect(result.json.error?.code).toBe("work-before-approval");
    expect(result.json.error?.message).toContain("src/new.ts");
  });

  it("accepts a commit of the change artifacts only", async () => {
    await allFourApproved(root);
    writeAt(root, "lexforge/changes/demo/design.md", "x");
    commitAll(root, "design");
    expect((await approveCall(root)).exitCode).toBe(0);
  });

  it("accepts an uncommitted edit inside the change directory", async () => {
    await allFourApproved(root);
    writeAt(root, "lexforge/changes/demo/notes.md", "x");
    expect((await approveCall(root)).exitCode).toBe(0);
  });

  it("refuses a dirty main tree outside the change directory", async () => {
    await allFourApproved(root);
    writeAt(root, "README.md", "dirty");
    expect((await approveCall(root)).json.error).toMatchObject({
      code: "work-before-approval",
      message: expect.stringContaining("README.md"),
    });
  });

  it("a plan migrated from 5.x skips the commits since dev and keeps the dirty-tree check", async () => {
    await allFourApproved(root);
    const state = readPlanState(root, CHANGE);
    state.migratedFrom = "5.x";
    writePlanState(root, CHANGE, state);
    writeAt(root, "src/new.ts", "x");
    commitAll(root, "earlier work");
    expect((await approveCall(root)).exitCode).toBe(0);
  });

  it("refuses an empty quote", async () => {
    expect((await approveCall(root, "")).json.error?.code).toBe("quote-required");
    expect((await approveCall(root, "   ")).json.error?.code).toBe("quote-required");
  });

  it("refuses off the change branch", async () => {
    await allFourApproved(root);
    git(root, "checkout", "dev");
    const result = await approveCall(root);
    expect(result.json.error?.code).toBe("change-branch-not-checked-out");
    expect(result.json.nextStep).toBe("git checkout feature/demo");
  });

  it("refuses a plan with check findings", async () => {
    await allFourApproved(root);
    edit(root, "1.1", "TODO");
    const result = await approveCall(root);
    expect(result.json.error?.code).toBe("plan-check-failing");
    expect(result.json.nextStep).toBe("lexforge check plan --change demo");
  });

  it("refuses a second approval and points at amend", async () => {
    await allFourApproved(root);
    await approveCall(root);
    const result = await approveCall(root);
    expect(result.json.error?.code).toBe("plan-already-approved");
    expect(result.json.nextStep).toContain("lexforge plan amend --change demo");
  });
});
