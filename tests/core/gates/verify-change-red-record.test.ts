import { afterEach, describe, expect, it } from "vitest";

import { recordEvidence } from "../../../src/core/gates/evidence-record.js";
import { putRedRun } from "../../../src/core/gates/red-run-store.js";
import { verifyChange } from "../../../src/core/gates/verify-change.js";
import { namedSectionFiles, sectionFilePath, splitPlanIntoIndex } from "../../helpers/plan-index.js";
import { CHANGE, created, RED_RECORD, SILENT, workspace } from "./verify-change-fixtures.js";

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

/** One ticked task naming a source file, and nothing else to close. */
const ONE_TASK_PLAN = [
  "## 1. Вход",
  "",
  "- [x] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
  "",
].join("\n");

function redRecordFindings(root: string) {
  return verifyChange({ cwd: root, change: CHANGE }).data.findings.filter(
    (finding) => finding.rule === "task-no-red-record",
  );
}

describe("verifyChange: пятое измерение — красный прогон задачи", () => {
  it("восемнадцать закрытых задач без записей дают восемнадцать находок и код 1, без исключения по возрасту change", async () => {
    const tasks = [
      "## 1. Волна",
      "",
      ...Array.from(
        { length: 18 },
        (_, index) => `- [x] ${index + 1}.1 Шаг ${index + 1} в \`src/step${index + 1}.ts\``,
      ),
      "",
    ].join("\n");
    const root = workspace(tasks, {
      [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\nskip_specs: true\n",
    }).root;
    // The one described label ("tests") is stamped fresh here so the total
    // findings count below is exactly the eighteen the scenario names, with
    // no unrelated "evidence-not-fresh" noise from an unstamped label.
    await recordEvidence({ cwd: root, change: CHANGE, label: "tests", stdout: SILENT, stderr: SILENT });

    const result = verifyChange({ cwd: root, change: CHANGE });

    expect(result.data.findings).toHaveLength(18);
    expect(
      result.data.findings.filter((finding) => finding.rule === "task-no-red-record"),
    ).toHaveLength(18);
    expect(result.exitCode).toBe(1);
  });

  it("задачи 1.1-1.5 с записями и 1.6 без записи называют только 1.6", () => {
    const tasks = [
      "## 1. Волна",
      "",
      ...Array.from({ length: 6 }, (_, index) => `- [x] 1.${index + 1} Шаг ${index + 1} в \`src/step${index + 1}.ts\``),
      "",
    ].join("\n");
    const root = workspace(tasks, {
      [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\nskip_specs: true\n",
    }).root;

    for (let index = 1; index <= 5; index += 1) {
      putRedRun(root, CHANGE, `1.${index}`, RED_RECORD);
    }

    const found = redRecordFindings(root);

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("1.6");
  });

  it("задача, называющая только тестовый файл, не проверяется этим измерением", () => {
    const tasks = [
      "## 1. Волна",
      "",
      "- [x] 1.1 Написать тест в `tests/core/gates/example.test.ts`",
      "",
    ].join("\n");
    const root = workspace(tasks, {
      [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\nskip_specs: true\n",
    }).root;

    expect(redRecordFindings(root)).toEqual([]);
  });

  it("задача, называющая только файл внутри каталога change, не проверяется этим измерением", () => {
    const tasks = [
      "## 1. Волна",
      "",
      `- [x] 1.1 Написать спеку в \`lexforge/changes/${CHANGE}/specs/auth/spec.md\``,
      "",
    ].join("\n");
    const root = workspace(tasks, {
      [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\nskip_specs: true\n",
    }).root;

    expect(redRecordFindings(root)).toEqual([]);
  });

  it("задача без файла вовсе не проверяется этим измерением, даже без записи", () => {
    const tasks = ["## 1. Волна", "", "- [x] 1.1 Прогнать миграцию вручную", ""].join("\n");
    const root = workspace(tasks, {
      [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\nskip_specs: true\n",
    }).root;

    expect(redRecordFindings(root)).toEqual([]);
  });

  it("запись с кодом возврата 0 считается отсутствующей", () => {
    const root = workspace(ONE_TASK_PLAN, {
      [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\nskip_specs: true\n",
    }).root;
    putRedRun(root, CHANGE, "1.1", { ...RED_RECORD, exitCode: 0 });

    const found = redRecordFindings(root);

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("1.1");
  });

  it("запись с ненулевым кодом возврата закрывает находку", () => {
    const root = workspace(ONE_TASK_PLAN, {
      [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\nskip_specs: true\n",
    }).root;
    putRedRun(root, CHANGE, "1.1", RED_RECORD);

    expect(redRecordFindings(root)).toEqual([]);
  });

  it("задача, первым называющая тестовый файл, не проверяется, даже когда строка позже называет исходник как предмет теста", () => {
    const tasks = [
      "## 1. Волна",
      "",
      "- [x] 1.1 Написать тест в `tests/core/gates/x.test.ts`: `src/core/gates/x.ts` возвращает true",
      "",
    ].join("\n");
    const root = workspace(tasks, {
      [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\nskip_specs: true\n",
    }).root;

    expect(redRecordFindings(root)).toEqual([]);
  });

  it("задача, чья работа — только прогон, не проверяется, даже когда падение называет исходный модуль", () => {
    const tasks = [
      "## 1. Волна",
      "",
      "- [x] 1.1 Прогнать `npx vitest run tests/core/gates/x.test.ts` и увидеть, что он падает на `src/core/gates/x.ts`",
      "",
    ].join("\n");
    const root = workspace(tasks, {
      [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\nskip_specs: true\n",
    }).root;

    expect(redRecordFindings(root)).toEqual([]);
  });

  it("задача, первым называющая исходник вне tests/ и вне каталога change, без записи всё ещё даёт находку", () => {
    const tasks = [
      "## 1. Волна",
      "",
      "- [x] 1.1 Написать `src/core/gates/x.ts`: обрабатывает ошибку. Check: `npx vitest run tests/core/gates/x.test.ts`",
      "",
    ].join("\n");
    const root = workspace(tasks, {
      [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\nskip_specs: true\n",
    }).root;

    const found = redRecordFindings(root);

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("1.1");
  });

  it("задача, объявившая себя переносом через (move) после метки группы, без записи не даёт находки", () => {
    const tasks = [
      "## 1. Волна",
      "",
      "- [x] 1.1 [P] (move) Перенести проверку пароля в `src/core/gates/x.ts`",
      "",
    ].join("\n");
    const root = workspace(tasks, {
      [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\nskip_specs: true\n",
    }).root;

    expect(redRecordFindings(root)).toEqual([]);
  });

  it("та же строка без (move) всё ещё даёт находку, как бы ни звучали её слова", () => {
    const tasks = [
      "## 1. Волна",
      "",
      "- [x] 1.1 [P] Перенести проверку пароля в `src/core/gates/x.ts`",
      "",
    ].join("\n");
    const root = workspace(tasks, {
      [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\nskip_specs: true\n",
    }).root;

    const found = redRecordFindings(root);

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("1.1");
  });

  it("задача раздела, на который ссылается индекс, несёт находку под файлом своего раздела, а не под индексом tasks.md", () => {
    const flat = [
      "## 1. Волна",
      "",
      "- [x] 1.1 Написать `src/core/gates/x.ts`: обрабатывает ошибку. " +
        "Check: `npx vitest run tests/core/gates/x.test.ts`",
      "",
    ].join("\n");
    const { index, sections } = splitPlanIntoIndex(flat);
    const sectionPath = `lexforge/changes/${CHANGE}/${sectionFilePath("1")}`;
    const indexPath = `lexforge/changes/${CHANGE}/tasks.md`;
    const root = workspace(index, {
      [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\nskip_specs: true\n",
      ...namedSectionFiles(`lexforge/changes/${CHANGE}`, sections),
    }).root;

    const found = redRecordFindings(root);

    expect(found).toHaveLength(1);
    expect(found[0]!.file).toBe(sectionPath);
    expect(found[0]!.file).not.toBe(indexPath);
    expect(found[0]!.line).toBe(3);
  });
});
