import { describe, expect, it } from "vitest";

import { checkTaskFields } from "../../../src/core/gates/plan-check-task-fields.js";
import { parseSections } from "../../../src/core/gates/plan-check-sections-parse.js";
import { parseTaskList } from "../../../src/core/gates/task-list.js";

function full(number: string, extra = "", file = `src/f${number}.ts`): string {
  return [
    `- [ ] ${number} Do ${number}`,
    `      Files: \`${file}\``,
    `      Test: \`test/t${number}.test.ts\``,
    `      Command: \`npm test\``,
    ...(extra ? [`      ${extra}`] : []),
    "",
  ].join("\n");
}

function check(content: string) {
  const tasks = parseTaskList(content, "tasks.md");
  return checkTaskFields({ file: "tasks.md", tasks }, parseSections(content, tasks, "tasks.md"));
}

const rules = (content: string): string[] => check(content).map((finding) => finding.rule);

function twoSections(file: string): string {
  return [
    "## 1. First",
    "",
    "Depends on: none",
    "",
    full("1.1", "", file),
    "## 2. Second",
    "",
    "Depends on: 1",
    "",
    full("2.1", "", file),
  ].join("\n");
}

describe("checkTaskFields", () => {
  it("names each missing field", () => {
    expect(rules("- [ ] 1.1 x")).toEqual(["task-missing-files", "task-missing-test", "task-missing-command"]);
  });

  it("lets a move task go without Test", () => {
    expect(rules("- [ ] 1.1 (move) x\n      Files: `a.ts`\n      Command: `npm test`")).toEqual([]);
  });

  it("does not report a missing field that was written wrongly", () => {
    expect(
      rules("- [ ] 1.1 x\n      Files: `a.ts`\n      Test: nothing\n      Command: `a`\n      Command: `b`"),
    ).toEqual(["task-field-malformed", "task-field-repeated"]);
  });

  it("reports an unknown control", () => {
    expect(rules(full("1.1", "Controls: payments"))).toEqual(["task-control-unknown"]);
  });

  it("refuses a dependency on a task the plan lacks or on a later one", () => {
    expect(rules(full("1.1", "Depends on: 9.9") + full("1.2", "Depends on: 1.3") + full("1.3"))).toEqual([
      "task-depends-on-unknown",
      "task-depends-on-forward",
    ]);
  });

  it("refuses two unordered tasks that write one file", () => {
    expect(rules(full("1.1", "", "src/a.ts") + full("1.2", "", "src/a.ts"))).toEqual([
      "shared-file-without-order",
    ]);
  });

  it("names the first task and the file in the finding on the second", () => {
    const [finding] = check(full("1.1", "", "src/a.ts") + full("1.2", "", "src/a.ts"));
    expect(finding!.line).toBe(5);
    expect(finding!.message).toContain("1.1");
    expect(finding!.message).toContain("src/a.ts");
  });

  it("accepts the same two tasks once one depends on the other", () => {
    expect(rules(full("1.1", "", "src/a.ts") + full("1.2", "Depends on: 1.1", "src/a.ts"))).toEqual([]);
  });

  it("accepts an order that runs through a third task", () => {
    expect(
      rules(
        full("1.1", "", "src/a.ts") + full("1.2", "Depends on: 1.1") + full("1.3", "Depends on: 1.2", "src/a.ts"),
      ),
    ).toEqual([]);
  });

  it("accepts the same file in two sections ordered by section Depends on", () => {
    expect(rules(twoSections("src/a.ts"))).toEqual([]);
  });

  it("refuses the same file in two sections that do not wait for each other", () => {
    expect(rules(twoSections("src/a.ts").replace("Depends on: 1", "Depends on: none"))).toEqual([
      "shared-file-without-order",
    ]);
  });
});
