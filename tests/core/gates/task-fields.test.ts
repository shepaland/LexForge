import { describe, expect, it } from "vitest";

import { parseTaskList } from "../../../src/core/gates/task-list.js";

describe("parseTaskList: task fields", () => {
  it("reads every field of a task", () => {
    const [task] = parseTaskList(
      [
        "- [ ] 2.1 Search over note text",
        "      Files: `src/notes.js`, `test/notes.test.js`",
        "      Test: `test/notes.test.js`",
        "      Command: `npm test -- test/notes.test.js`",
        "      Depends on: 1.2, 1.3",
        "      Controls: migrations, authorization",
      ].join("\n"),
    );
    expect(task).toMatchObject({
      number: "2.1",
      tests: ["test/notes.test.js"],
      command: "npm test -- test/notes.test.js",
      dependsOn: ["1.2", "1.3"],
      controls: ["migrations", "authorization"],
      fieldProblems: [],
    });
  });

  it("reads an absent Depends on as null", () => {
    expect(parseTaskList("- [ ] 1.1 x\n      Command: `npm test`")[0]!.dependsOn).toBeNull();
  });

  it("reports an unknown control and a second Command line", () => {
    const [task] = parseTaskList(
      "- [ ] 1.1 x\n      Command: `a`\n      Command: `b`\n      Controls: payments",
    );
    expect(task!.fieldProblems).toEqual([
      { field: "Command", kind: "repeated" },
      { field: "Controls", kind: "unknown-control", value: "payments" },
    ]);
  });

  it("reports a malformed Test, Command and Depends on", () => {
    const [task] = parseTaskList(
      "- [ ] 1.1 x\n      Test: nothing\n      Command: npm test\n      Depends on: first",
    );
    expect(task!.fieldProblems).toEqual([
      { field: "Test", kind: "malformed" },
      { field: "Command", kind: "malformed" },
      { field: "Depends on", kind: "malformed" },
    ]);
  });

  it("keeps Test and Command paths out of files but names them", () => {
    const [task] = parseTaskList(
      [
        "- [ ] 1.1 x",
        "      Files: `src/a.ts`",
        "      Test: `test/a.test.ts`",
        "      Command: `npx vitest run test/a.test.ts`",
      ].join("\n"),
    );
    expect(task!.files).toEqual(["src/a.ts"]);
    expect(task!.namedFiles).toEqual(expect.arrayContaining(["src/a.ts", "test/a.test.ts"]));
  });

  it("reads (move) right after the number", () => {
    expect(parseTaskList("- [ ] 1.1 (move) carry x")[0]!.declaresMove).toBe(true);
  });

  it("keeps a bracket after the number as the task's own words", () => {
    expect(parseTaskList("- [ ] 1.1 [A] x")[0]!.firstLine).toBe("[A] x");
  });
});
