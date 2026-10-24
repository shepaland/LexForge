import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeProgress } from "../../src/core/tasks/progress.js";
import { readWorkflowFile } from "../../src/core/tasks/workflow-file.js";
import type { GitWorkspace } from "../helpers/git-workspace.js";
import { allFourApproved, approveCall, cli } from "../helpers/plan-fixture.js";
import { createShortWorkspace, spoil } from "../helpers/short-workspace.js";
import { CHANGE, taskSteps } from "../helpers/task-workspace.js";

let ws: GitWorkspace;
let root: string;
let steps: ReturnType<typeof taskSteps>;
beforeEach(() => {
  ws = createShortWorkspace();
  root = ws.root;
  steps = taskSteps(root);
});
afterEach(() => ws.remove());

const escalate = () => cli(root, ["plan", "escalate", "--change", CHANGE]);

describe("lexforge plan escalate", { timeout: 30_000 }, () => {
  it("moves a short change to the full path and names plan review", async () => {
    const result = await escalate();
    expect(result.exitCode).toBe(0);
    expect(readWorkflowFile(root, CHANGE).path).toBe("full");
    expect(result.json.data?.nextStep).toBe("lexforge plan review --change demo --angle specs --file <report.md>");
  });

  it("refuses a change that is already on the full path", async () => {
    await escalate();
    const result = await escalate();
    expect(result.exitCode).toBe(2);
    expect(result.json.error?.code).toBe("already-full-path");
    expect(result.json.nextStep).toBe("lexforge status --change demo");
  });

  it("refuses while the short task runs", async () => {
    await steps.start("1.1");
    const result = await escalate();
    expect(result.exitCode).toBe(2);
    expect(result.json.error?.code).toBe("task-in-progress");
    expect(result.json.nextStep).toBe("lexforge task abandon --change demo --task 1.1");
    expect(readWorkflowFile(root, CHANGE).path).toBe("short");
  });

  it("a closed short task survives escalation as closed", async () => {
    await steps.approvedReview("1.1");
    expect((await steps.close("1.1")).exitCode).toBe(0);
    spoil.addSecondTask(ws);
    expect((await escalate()).exitCode).toBe(0);
    expect(computeProgress(root, CHANGE)).toMatchObject({ total: 2, closed: 1 });
  });

  it("plan approve after escalation skips the commits of closed tasks", async () => {
    await steps.approvedReview("1.1");
    await steps.close("1.1");
    spoil.addSecondTask(ws);
    await escalate();
    await allFourApproved(root);
    const result = await approveCall(root);
    expect(result.json.error).toBeUndefined();
    expect(result.exitCode).toBe(0);
  });

  it("plan approve still refuses work that no closed task brought", async () => {
    await escalate();
    await allFourApproved(root);
    const { commitOnChangeBranch } = await import("../helpers/task-workspace.js");
    commitOnChangeBranch(root, { "src/stray.js": "export {}\n" });
    const result = await approveCall(root);
    expect(result.json.error?.code).toBe("work-before-approval");
  });
});
