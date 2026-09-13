import { afterEach, describe, expect, it } from "vitest";

import { checkPlan } from "../../../src/core/gates/plan-check.js";
import { parseTaskList } from "../../../src/core/gates/task-list.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

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
    const tasks = parseTaskList("- [ ] 1.1 Check: `pytest tests/test_login.py`\n");

    expect(tasks[0]!.namedFiles).toEqual(["tests/test_login.py"]);
  });

  it("флаг сразу после интерпретатора не прячет файл, идущий следом", () => {
    const tasks = parseTaskList("- [ ] 1.1 Check: `python3 -m pytest tests/test_login.py`\n");

    expect(tasks[0]!.namedFiles).toEqual(["tests/test_login.py"]);
    expect(tasks[0]!.namedFiles).not.toContain("-m");
  });

  it("интерпретатор вне признанного списка всё равно именует свой скрипт", () => {
    const tasks = parseTaskList("- [ ] 1.1 Check: `perl script.pl`\n");

    expect(tasks[0]!.namedFiles).toEqual(["script.pl"]);
  });

  it("кавычка вне значения --command не снимается — снятие кавычек не задевает посторонний токен", () => {
    const tasks = parseTaskList("- [ ] 1.1 Check: `npx vitest run 'tests/quoted.test.ts'`\n");

    expect(tasks[0]!.namedFiles).toEqual(["'tests/quoted.test.ts'"]);
  });
});

/**
 * A workspace whose plan is an index, one linked section file - the plan
 * form `check plan` requires now, so this fixture trips no finding of its
 * own about tasks left inside `tasks.md`.
 */
function groupsIndexWorkspace(indexPlan: string, files: Record<string, string>): string {
  return makeWorkspace({
    "lexforge/config.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-groups/.lexforge.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-groups/proposal.md": "## Why\n\nGroup labels need their own checks.\n",
    "lexforge/changes/add-groups/design.md": "## Context\n\nOne file per section, linked from an index.\n",
    "lexforge/changes/add-groups/tasks.md": indexPlan,
    ...files,
  });
}

const INDEX_SHARED_FILE_VIA_TEST_RUNNER = [
  "## 12. Group label shared file named only past a test-runner program",
  "`tasks/12-shared-via-runner.md`",
  "",
].join("\n");

/**
 * Two groups of the same section, each running a test-runner-shaped command
 * naming the same file as its first argument, past the program. Before this
 * fix, `pytest tests/test_login.py` named nothing, so the two groups' shared
 * file went unnoticed - the exact collision `section-group-shared-file`
 * exists to catch, reopened for every Python-test-runner-shaped command.
 */
const INDEX_SHARED_FILE_VIA_TEST_RUNNER_SECTION = [
  "Depends on: none",
  "",
  "- [ ] 12.1 [A] Write the failing test. Check: `pytest tests/test_login.py`",
  "- [ ] 12.2 [B] Write the implementation. Check: `pytest tests/test_login.py`",
  "",
].join("\n");

describe("checkPlan: файл, общий только через команду тест-раннера", () => {
  const created: string[] = [];

  afterEach(() => {
    while (created.length > 0) {
      removeWorkspace(created.pop()!);
    }
  });

  it("две группы, обе называющие файл только через `pytest ...`, дают section-group-shared-file", () => {
    const root = groupsIndexWorkspace(INDEX_SHARED_FILE_VIA_TEST_RUNNER, {
      "lexforge/changes/add-groups/tasks/12-shared-via-runner.md":
        INDEX_SHARED_FILE_VIA_TEST_RUNNER_SECTION,
    });
    created.push(root);

    const result = checkPlan({ cwd: root, change: "add-groups" });
    const findings = result.data.findings;

    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("section-group-shared-file");
    expect(findings[0]!.file).toBe("lexforge/changes/add-groups/tasks/12-shared-via-runner.md");
    expect(findings[0]!.message).toContain("12");
    expect(findings[0]!.message).toContain("A");
    expect(findings[0]!.message).toContain("B");
    expect(findings[0]!.message).toContain("tests/test_login.py");
    expect(result.exitCode).toBe(1);
  });
});
