import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyChange } from "../../../src/core/gates/verify-change.js";
import { taskFindings } from "../../../src/core/gates/verify-change-tasks.js";
import { writeAt, type GitWorkspace } from "../../helpers/git-workspace.js";
import { createShortWorkspace, spoil } from "../../helpers/short-workspace.js";
import { CHANGE, taskSteps } from "../../helpers/task-workspace.js";

let ws: GitWorkspace;
beforeEach(async () => {
  ws = createShortWorkspace();
  await taskSteps(ws.root).redDone("1.1");
}, 60_000);
afterEach(() => ws.remove());

const rules = (): string[] => taskFindings(ws.root, CHANGE).map((f) => f.rule);

describe("taskFindings: the short path after red", { timeout: 60_000 }, () => {
  it("is clean while the change still fits the short path", () => {
    expect(rules()).toEqual([]);
  });

  it.each<[string, (w: GitWorkspace) => void]>([
    ["a second task", spoil.addSecondTask],
    ["a delta for a new capability", spoil.addDeltaForNewCapability],
    ["a Data line in the delta", spoil.addDataLine],
    ["a data directory", spoil.addDataDir],
    ["Controls: migrations", spoil.addMigrationsControl],
  ])("finds a short change that took on %s", (_, apply) => {
    apply(ws);
    expect(rules()).toContain("short-path-not-eligible");
  });

  it("finds a short change whose delta no longer passes validate --strict", () => {
    spoil.breakDeltaScenario(ws);
    const findings = taskFindings(ws.root, CHANGE);
    expect(findings.map((f) => f.rule)).toEqual(["specs-before-code"]);
    expect(findings[0].message).toContain("Run: lexforge validate demo --strict");
  });

  it("leaves the delta alone on a change that skips specs", () => {
    spoil.breakDeltaScenario(ws);
    spoil.setSkipSpecs(ws);
    expect(rules()).toEqual([]);
  });

  it("counts a broken delta under the short path in the summary of verify", () => {
    writeAt(ws.root, "lexforge/config.yaml", "schema: spec-driven\nverification:\n  tests: node -e \"\"\nengineering:\n  stacks: []\n");
    spoil.breakDeltaScenario(ws);
    expect(verifyChange({ cwd: ws.root, change: CHANGE }).data.summary.shortPath).toBe(1);
  });
});
