import { describe, expect, it } from "vitest";

import { parseTaskList } from "../../../src/core/gates/task-list.js";

/**
 * `readNamedFiles` used to drop the token right after ANY program that was
 * not itself path-shaped - which is every test-runner-shaped program name,
 * since `pytest`, `jest` and `ruff` hold no slash and match no extension.
 * That dropped the very file such a command names, reopening the collision
 * the shared-file rule exists to catch. These tests cover the narrower rule:
 * a second token is dropped only when the leading token is a real
 * interpreter that runs a script handed to it, and that second token is
 * itself path-shaped.
 */
describe("parseTaskList: namedFiles отличает программу-раннер от файла-цели", () => {
  it("программа, не входящая в список интерпретаторов, называет свой первый аргумент файлом", () => {
    const tasks = parseTaskList("- [ ] 1.1 Command: `pytest tests/test_login.py`\n");

    expect(tasks[0]!.namedFiles).toEqual(["tests/test_login.py"]);
  });

  it("флаг сразу после интерпретатора не прячет файл, идущий следом", () => {
    const tasks = parseTaskList("- [ ] 1.1 Command: `python3 -m pytest tests/test_login.py`\n");

    expect(tasks[0]!.namedFiles).toEqual(["tests/test_login.py"]);
    expect(tasks[0]!.namedFiles).not.toContain("-m");
  });

  it("интерпретатор вне признанного списка всё равно именует свой скрипт", () => {
    const tasks = parseTaskList("- [ ] 1.1 Command: `perl script.pl`\n");

    expect(tasks[0]!.namedFiles).toEqual(["script.pl"]);
  });

  it("кавычка вне значения --command не снимается — снятие кавычек не задевает посторонний токен", () => {
    const tasks = parseTaskList("- [ ] 1.1 Command: `npx vitest run 'tests/quoted.test.ts'`\n");

    expect(tasks[0]!.namedFiles).toEqual(["'tests/quoted.test.ts'"]);
  });
});
