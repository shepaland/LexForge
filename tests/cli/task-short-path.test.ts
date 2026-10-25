import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readTaskRecord } from "../../src/core/tasks/records.js";
import type { GitWorkspace } from "../helpers/git-workspace.js";
import { createShortWorkspace, spoil } from "../helpers/short-workspace.js";
import { CHANGE, commitIn, createTaskWorkspace, FAILING_TEST, taskSteps } from "../helpers/task-workspace.js";

let ws: GitWorkspace;
let steps: ReturnType<typeof taskSteps>;
beforeEach(() => {
  ws = createShortWorkspace();
  steps = taskSteps(ws.root);
});
afterEach(() => ws.remove());

describe("the short path in task commands", { timeout: 20_000 }, () => {
  it("task start on a short change needs no approval", async () => {
    expect((await steps.start("1.1")).exitCode).toBe(0);
  });

  it("task start on a short change that outgrew it names plan escalate", async () => {
    spoil.addSecondTask(ws);
    const result = await steps.start("1.1");
    expect(result.exitCode).toBe(2);
    expect(result.json.error).toMatchObject({ code: "short-path-not-eligible" });
    expect(result.json.nextStep).toBe("lexforge plan escalate --change demo");
  });

  it("task red refuses a short change that outgrew it", async () => {
    await steps.start("1.1");
    spoil.addDataDir(ws);
    commitIn(steps.wt("1.1"), { "test/notes.test.mjs": FAILING_TEST });
    const result = await steps.red("1.1");
    expect(result.json.error).toMatchObject({ code: "short-path-not-eligible" });
    expect(result.json.nextStep).toBe("lexforge plan escalate --change demo");
  });

  it("task red on a short change refuses while the delta fails validate --strict", async () => {
    await steps.start("1.1");
    spoil.breakDeltaScenario(ws);
    commitIn(steps.wt("1.1"), { "test/notes.test.mjs": FAILING_TEST });
    const result = await steps.red("1.1");
    expect(result.exitCode).toBe(2);
    expect(result.json.error).toMatchObject({ code: "specs-before-code" });
    expect(result.json.nextStep).toBe("lexforge validate demo --strict");
  });

  it("task red on a short change with a valid delta records the red", async () => {
    await steps.start("1.1");
    commitIn(steps.wt("1.1"), { "test/notes.test.mjs": FAILING_TEST });
    expect((await steps.red("1.1")).exitCode).toBe(0);
  });

  it("task red on a short skip_specs change runs without a delta", async () => {
    spoil.setSkipSpecs(ws);
    spoil.removeDeltas(ws);
    await steps.start("1.1");
    commitIn(steps.wt("1.1"), { "test/notes.test.mjs": FAILING_TEST });
    expect((await steps.red("1.1")).exitCode).toBe(0);
  });

  it("a full-path change is not asked for the delta at red", async () => {
    // The task workspace has no workflow.json, so it stays on the full path.
    const full = createTaskWorkspace();
    try {
      const fullSteps = taskSteps(full.root);
      await fullSteps.redDone("1.1");
      expect(readTaskRecord(full.root, CHANGE, "1.1")?.red).not.toBeNull();
    } finally {
      full.remove();
    }
  });
});
