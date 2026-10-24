import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertShortPathEligible, shortPathProblems } from "../../../src/core/tasks/short-path.js";
import type { GitWorkspace } from "../../helpers/git-workspace.js";
import { createShortWorkspace, spoil } from "../../helpers/short-workspace.js";
import { CHANGE } from "../../helpers/task-workspace.js";

let ws: GitWorkspace;
beforeEach(() => {
  ws = createShortWorkspace();
});
afterEach(() => ws.remove());

describe("shortPathProblems", () => {
  it("accepts one task that changes an existing capability", () => {
    expect(shortPathProblems(ws.root, CHANGE)).toEqual([]);
    expect(() => assertShortPathEligible(ws.root, CHANGE)).not.toThrow();
  });

  it.each([
    ["two tasks", spoil.addSecondTask, "the plan has 2 tasks, the short path allows one"],
    [
      "a new capability",
      spoil.addDeltaForNewCapability,
      "delta specs/billing/spec.md adds a capability the project does not have",
    ],
    ["a Data: line", spoil.addDataLine, 'requirement "Search over note text" holds a Data: line'],
    ["a data directory", spoil.addDataDir, "the change holds data/"],
    ["migrations control", spoil.addMigrationsControl, "task 1.1 declares Controls: migrations"],
  ])("refuses %s", (_name, spoiler, reason) => {
    spoiler(ws);
    expect(shortPathProblems(ws.root, CHANGE)).toEqual([reason]);
  });

  it("joins the reasons and names plan escalate", () => {
    spoil.addSecondTask(ws);
    spoil.addDataDir(ws);
    expect(() => assertShortPathEligible(ws.root, CHANGE)).toThrowError(
      expect.objectContaining({
        code: "short-path-not-eligible",
        message: expect.stringContaining("the plan has 2 tasks, the short path allows one; the change holds data/"),
        nextStep: "lexforge plan escalate --change demo",
      }),
    );
  });
});
