import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../../src/cli/run.js";
import { writeTaskRecord } from "../../src/core/tasks/records.js";
import { createCapture } from "../helpers/capture.js";
import { createGitWorkspace, type GitWorkspace } from "../helpers/git-workspace.js";
import { appendTask, CHANGE, planFiles } from "../helpers/plan-fixture.js";

let ws: GitWorkspace;
let root: string;

beforeEach(() => {
  ws = createGitWorkspace(planFiles());
  root = ws.root;
  appendTask(root, "2.2");
  const base = {
    origin: "native" as const, executor: "exec-1", branch: "b", worktree: "/nowhere", base: "abc",
    startedAt: "2026-10-22T10:00:00.000Z", red: null, green: null, reviews: [], attempts: 0,
  };
  writeTaskRecord(root, CHANGE, { ...base, id: "1.1", closed: { merge: "def", at: "2026-10-22T11:00:00.000Z" } });
  writeTaskRecord(root, CHANGE, { ...base, id: "1.2", closed: null });
});
afterEach(() => ws.remove());

describe("lexforge status with a plan", () => {
  it("prints the share of closed tasks and the number of running agents", async () => {
    const capture = createCapture();
    const exitCode = await run(["status", "--change", CHANGE], { cwd: root, stdout: capture.stdout, stderr: capture.stderr });
    expect(exitCode).toBe(0);
    expect(capture.out).toContain("Tasks: 1/4 closed (25%)");
    expect(capture.out).toContain("Running: 1");
    expect(capture.out).toContain("Waiting: 2, blocked: 0");
  });

  it("puts the progress into the JSON under tasks", async () => {
    const capture = createCapture();
    await run(["status", "--change", CHANGE, "--json"], { cwd: root, stdout: capture.stdout, stderr: capture.stderr });
    expect(JSON.parse(capture.out).tasks).toMatchObject({ total: 4, closed: 1, inProgress: 1 });
  });

  it("reports no tasks while the plan is not written", async () => {
    const bare = createGitWorkspace({
      "lexforge/changes/demo/.lexforge.yaml": "schema: spec-driven\n",
      "lexforge/changes/demo/proposal.md": "## Why\n\nA greeting is missing.\n",
    });
    try {
      const capture = createCapture();
      await run(["status", "--change", CHANGE, "--json"], { cwd: bare.root, stdout: capture.stdout, stderr: capture.stderr });
      const data = JSON.parse(capture.out);
      expect(data.tasks).toBeNull();
      expect(data).not.toHaveProperty("completion");
      expect(data).not.toHaveProperty("workflow");
    } finally {
      bare.remove();
    }
  });
});
