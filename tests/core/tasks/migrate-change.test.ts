import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkPlan } from "../../../src/core/gates/plan-check.js";
import { parseTaskList } from "../../../src/core/gates/task-list.js";
import { migrateChange } from "../../../src/core/tasks/migrate.js";
import { assertPlanApproved, readPlanState, writePlanState } from "../../../src/core/tasks/plan-state.js";
import { readTaskRecord } from "../../../src/core/tasks/records.js";
import { CHANGE_5X as CHANGE, DIR_5X, makeChange5x, type Change5xOptions } from "../../helpers/change-5x.js";
import type { GitWorkspace } from "../../helpers/git-workspace.js";

let ws: GitWorkspace | undefined;
afterEach(() => ws?.remove());

function setup(options: Change5xOptions = {}): string {
  ws = makeChange5x(options);
  return ws.root;
}

/** Every section file of the plan, in order. */
function tasksMd(root: string): string {
  return [1, 2, 3, 4]
    .map((n) => path.join(root, DIR_5X, `tasks/section-${n}.md`))
    .filter((file) => existsSync(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

describe("migrateChange on a change of LexForge 5.x", () => {
  it("fills the fields of every task from execution-plan.json", () => {
    const root = setup();
    migrateChange(root, CHANGE);
    expect(parseTaskList(tasksMd(root)).find((t) => t.number === "2.1")).toMatchObject({
      files: ["src/notes.js"],
      tests: ["test/notes.test.mjs"],
      command: "node --test test/notes.test.mjs",
      dependsOn: ["1.1"],
      controls: [],
    });
  });

  it("drops group labels and puts (move) after the number", () => {
    const root = setup();
    migrateChange(root, CHANGE);
    expect(tasksMd(root)).not.toMatch(/\[[A-D]\]/);
    expect(tasksMd(root)).toMatch(/^- \[ \] 3\.1 \(move\) /m);
    expect(parseTaskList(tasksMd(root)).find((t) => t.number === "3.1")?.declaresMove).toBe(true);
  });

  it("closes ticked tasks with a closed cycle as historical and reopens the rest", () => {
    const root = setup();
    expect(migrateChange(root, CHANGE)).toMatchObject({
      closed: ["1.1"],
      reopened: ["1.2"],
      open: ["1.2", "2.1", "3.1"],
    });
    expect(readTaskRecord(root, CHANGE, "1.1")).toMatchObject({ origin: "historical", red: null, green: null, reviews: [] });
    expect(readTaskRecord(root, CHANGE, "1.2")).toBeNull();
    expect(tasksMd(root)).toMatch(/^- \[ \] 1\.2 /m);
    expect(tasksMd(root)).toMatch(/^- \[x\] 1\.1 /m);
  });

  it("leaves a closed task as it was, but for its group label", () => {
    const root = setup();
    const file = path.join(root, DIR_5X, "tasks/section-1.md");
    const before = readFileSync(file, "utf8").split("\n");
    migrateChange(root, CHANGE);
    const after = readFileSync(file, "utf8").split("\n");
    const own = (lines: string[]) => {
      const at = lines.findIndex((line) => line.startsWith("- [x] 1.1 "));
      let end = at + 1;
      while (end < lines.length && /^\s+\S/.test(lines[end]!)) end += 1;
      return lines.slice(at, end);
    };
    expect(own(after)).toEqual(own(before).map((line) => line.replace(" [A] ", " ")));
  });

  it("plan check still asks a ticked task without a historical record for its fields", () => {
    const root = setup({ taskOutsideCycles: "4.1" });
    migrateChange(root, CHANGE);
    const file = path.join(root, DIR_5X, "tasks/section-4.md");
    writeFileSync(file, readFileSync(file, "utf8").replace("- [ ] 4.1", "- [x] 4.1"));
    const rules = checkPlan({ cwd: root, change: CHANGE }).data.findings.map((item) => item.rule);
    expect(rules).toEqual(expect.arrayContaining(["task-missing-files", "task-missing-test", "task-missing-command"]));
  });

  it("sends open tasks with their fields to plan review, and plan check passes", () => {
    const root = setup();
    expect(migrateChange(root, CHANGE)).toMatchObject({
      approved: false,
      missingFields: [],
      nextStep: "lexforge plan review --change demo --angle specs --file <report.md>",
    });
    expect(readPlanState(root, CHANGE).migratedFrom).toBe("5.x");
    expect(readPlanState(root, CHANGE).approval).toBeNull();
    expect(checkPlan({ cwd: root, change: CHANGE }).data.findings).toEqual([]);
  });

  it("approves a change whose tasks all closed historically", () => {
    const root = setup({ allClosed: true });
    expect(migrateChange(root, CHANGE)).toMatchObject({
      approved: true,
      open: [],
      reopened: [],
      nextStep: "lexforge review final --change demo",
    });
    expect(readPlanState(root, CHANGE).approval).toMatchObject({ quote: "migrated from 5.x" });
    expect(() => assertPlanApproved(root, CHANGE)).not.toThrow();
    expect(checkPlan({ cwd: root, change: CHANGE }).data.findings).toEqual([]);
  });

  it("plan check trusts a historical record only on a plan migrated from 5.x", () => {
    const root = setup({ workflow: 1, allClosed: true });
    migrateChange(root, CHANGE);
    expect(checkPlan({ cwd: root, change: CHANGE }).data.findings).toEqual([]);
    writePlanState(root, CHANGE, { ...readPlanState(root, CHANGE), migratedFrom: null });
    const rules = checkPlan({ cwd: root, change: CHANGE }).data.findings.map((item) => item.rule);
    expect(rules).toEqual(expect.arrayContaining(["task-missing-files", "task-missing-command"]));
  });

  it("leaves the plan unapproved and names the missing fields of a task outside every cycle", () => {
    const root = setup({ taskOutsideCycles: "4.1" });
    expect(migrateChange(root, CHANGE)).toMatchObject({
      approved: false,
      missingFields: [{ task: "4.1", fields: ["Files", "Test", "Command"] }],
      nextStep:
        "add the fields to the open tasks in tasks.md, then run: " +
        "lexforge plan review --change demo --angle specs --file <report.md>",
    });
  });

  it("a change without execution-plan.json migrates with every open task in missingFields", () => {
    const root = setup({ workflow: 1 });
    const result = migrateChange(root, CHANGE);
    expect(result.approved).toBe(false);
    expect(result.reopened).toEqual(["1.1", "1.2"]);
    expect(result.missingFields.map((item) => item.task)).toEqual(["1.1", "1.2", "2.1", "3.1"]);
    expect(result.missingFields.find((item) => item.task === "3.1")?.fields).toEqual(["Files", "Command"]);
  });

  it("a red-runs.json record closes a ticked task on any workflow version", () => {
    const root = setup({ workflow: 1, allClosed: true });
    expect(migrateChange(root, CHANGE)).toMatchObject({ approved: true, closed: ["1.1", "1.2", "2.1", "3.1"] });
    expect(readTaskRecord(root, CHANGE, "2.1")).toMatchObject({ origin: "historical" });
  });
});
