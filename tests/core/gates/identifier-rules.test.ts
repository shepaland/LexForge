import { describe, expect, it } from "vitest";

import { checkIdentifiers } from "../../../src/core/gates/identifier-rules.js";
import { parseTaskList, type PlanTasks } from "../../../src/core/gates/task-list.js";

const FILE = "lexforge/changes/add-auth/tasks.md";

function plan(...lines: string[]): PlanTasks {
  return { file: FILE, tasks: parseTaskList(lines.join("\n")) };
}

describe("checkIdentifiers: разнобой в написании имени", () => {
  it("две записи одного ключа дают находку с обеими записями и строками", () => {
    const findings = checkIdentifiers(
      plan(
        "- [ ] 1.1 Написать поле `resolvedOutputPath` в графе артефактов",
        "",
        "- [ ] 1.2 Прочитать `resolved_output_path` в команде статуса",
      ),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("identifier-spelling");
    expect(findings[0]!.file).toBe(FILE);
    expect(findings[0]!.level).toBe("error");
    expect(findings[0]!.message).toContain("resolvedOutputPath");
    expect(findings[0]!.message).toContain("resolved_output_path");
    expect(findings[0]!.message).toContain("line 1");
    expect(findings[0]!.message).toContain("line 3");
  });

  it("одно написание в двух задачах находки не даёт", () => {
    const findings = checkIdentifiers(
      plan(
        "- [ ] 1.1 Написать поле `resolvedOutputPath` в графе артефактов",
        "- [ ] 1.2 Прочитать `resolvedOutputPath` в команде статуса",
      ),
    );

    expect(findings).toEqual([]);
  });
});

describe("checkIdentifiers: что в сравнение не входит", () => {
  it("два разных файла с близким написанием находки не дают", () => {
    const findings = checkIdentifiers(
      plan(
        "- [ ] 1.1 Написать разбор строки задачи в `run.ts`",
        "- [ ] 1.2 Покрыть разбор строки задачи тестом в `run.test.ts`",
      ),
    );

    expect(findings).toEqual([]);
  });

  it("вызов команды и имя функции находки не дают", () => {
    const findings = checkIdentifiers(
      plan(
        "- [ ] 1.1 Прогнать `lexforge check plan` на плане этого этапа",
        "- [ ] 1.2 Написать `checkPlan` со сборкой находок трёх наборов правил",
      ),
    );

    expect(findings).toEqual([]);
  });

  it("короткая запись в двух регистрах находки не даёт", () => {
    const findings = checkIdentifiers(
      plan(
        "- [ ] 1.1 Написать чтение поля `id` в разборе записи журнала",
        "- [ ] 1.2 Прочитать колонку `ID` в выводе списка записей",
      ),
    );

    expect(findings).toEqual([]);
  });
});
