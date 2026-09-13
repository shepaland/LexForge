import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import { putRedRun } from "../../../src/core/gates/red-run-store.js";
import { verifyChange } from "../../../src/core/gates/verify-change.js";
import { createGitWorkspace } from "../../helpers/git-workspace.js";
import { AUTH_SPEC, CHANGE, CONFIG, created, RED_RECORD, workspace } from "./verify-change-fixtures.js";

const PLAN_FILE = `lexforge/changes/${CHANGE}/tasks.md`;

/** A plan whose tasks cover the only requirement of the change. */
const TWO_OPEN = [
  "## 1. Вход",
  "",
  "- [x] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
  "      -> auth#Password is stored hashed",
  "- [ ] 4.2 Написать проверку пароля при входе в `src/app.ts`",
  "- [ ] 7.1 Написать журнал неудачных входов в `src/app.ts`",
  "",
].join("\n");

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

describe("verifyChange: незакрытые задачи", () => {
  it("две задачи - [ ] дают две находки с номерами задач и номерами строк", () => {
    const root = workspace(TWO_OPEN).root;

    const open = verifyChange({ cwd: root, change: CHANGE }).data.findings.filter(
      (finding) => finding.rule === "task-not-done",
    );

    expect(open).toHaveLength(2);
    expect(open.map((finding) => finding.line)).toEqual([5, 6]);
    expect(open.map((finding) => finding.file)).toEqual([PLAN_FILE, PLAN_FILE]);
    expect(open[0]!.message).toContain("4.2");
    expect(open[0]!.message).toContain("Написать проверку пароля при входе");
    expect(open[1]!.message).toContain("7.1");
  });

  it("отметка в верхнем регистре считается закрытой задачей", () => {
    const root = workspace(TWO_OPEN.replace("- [x] 1.1", "- [X] 1.1")).root;

    const open = verifyChange({ cwd: root, change: CHANGE }).data.findings.filter(
      (finding) => finding.rule === "task-not-done",
    );

    expect(open.map((finding) => finding.line)).toEqual([5, 6]);
  });
});

describe("verifyChange: план как индекс", () => {
  it("незакрытая задача называет файл своего раздела, а не файл индекса", () => {
    const INDEX_TASKS = ["## 1. Вход", "`tasks/01-first.md`", ""].join("\n");
    const FIRST_SECTION = [
      "Depends on: none",
      "",
      "- [x] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
      "      -> auth#Password is stored hashed",
      "- [ ] 4.2 Написать проверку пароля при входе в `src/app.ts`",
      "",
    ].join("\n");

    const root = workspace(INDEX_TASKS, {
      [`lexforge/changes/${CHANGE}/tasks/01-first.md`]: FIRST_SECTION,
    }).root;

    const open = verifyChange({ cwd: root, change: CHANGE }).data.findings.filter(
      (finding) => finding.rule === "task-not-done",
    );

    expect(open).toHaveLength(1);
    expect(open[0]!.line).toBe(5);
    expect(open[0]!.file).toBe(`lexforge/changes/${CHANGE}/tasks/01-first.md`);
  });
});

describe("verifyChange: задача и её красная запись переживают раскладку по файлам", () => {
  it("задача с красной записью не даёт task-no-red-record, когда её раздел вынесен в свой файл", () => {
    const INDEX_TASKS = ["## 1. Вход", "`tasks/01-first.md`", ""].join("\n");
    const FIRST_SECTION = [
      "Depends on: none",
      "",
      "- [x] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
      "      -> auth#Password is stored hashed",
      "",
    ].join("\n");

    const root = workspace(INDEX_TASKS, {
      [`lexforge/changes/${CHANGE}/tasks/01-first.md`]: FIRST_SECTION,
    }).root;

    // The store reads only the task's own id - no file, no line - so a
    // record written under "1.1" still answers for it once the section that
    // used to hold "1.1" inline moves into `tasks/01-first.md`.
    putRedRun(root, CHANGE, "1.1", RED_RECORD);

    const findings = verifyChange({ cwd: root, change: CHANGE }).data.findings.filter(
      (finding) => finding.rule === "task-no-red-record",
    );

    expect(findings).toEqual([]);
  });
});

describe("verifyChange: плана нет", () => {
  it("change без tasks.md даёт UsageError с кодом artifact-missing", () => {
    const made = createGitWorkspace({
      "lexforge/config.yaml": CONFIG,
      [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
      [`lexforge/changes/${CHANGE}/proposal.md`]: "## Why\n\nPasswords are stored in the open.\n",
      [`lexforge/changes/${CHANGE}/specs/auth/spec.md`]: AUTH_SPEC,
      [`lexforge/changes/${CHANGE}/design.md`]: "## Context\n\nOne service, one database.\n",
    });
    created.push(made);

    let thrown: unknown;
    try {
      verifyChange({ cwd: made.root, change: CHANGE });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UsageError);
    expect((thrown as UsageError).code).toBe("artifact-missing");
    expect((thrown as UsageError).nextStep).toBe(`lexforge instructions tasks --change ${CHANGE}`);
  });
});
