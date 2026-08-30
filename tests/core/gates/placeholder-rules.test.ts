import { describe, expect, it } from "vitest";

import {
  BUILT_IN_MARKERS,
  checkPlaceholders,
} from "../../../src/core/gates/placeholder-rules.js";
import { parseTaskList, type PlanTasks } from "../../../src/core/gates/task-list.js";
import type { Finding } from "../../../src/core/validation/finding.js";

const FILE = "lexforge/changes/add-auth/tasks.md";

/** Builds the parsed plan the rules read, out of the lines of a `tasks.md`. */
function plan(...lines: string[]): PlanTasks {
  return { file: FILE, tasks: parseTaskList(lines.join("\n")) };
}

/** Findings of one rule, in the order the rule reported them. */
function only(findings: Finding[], rule: string): Finding[] {
  return findings.filter((finding) => finding.rule === rule);
}

describe("checkPlaceholders: английские маркеры", () => {
  it("каждая из трёх задач даёт одну находку task-placeholder", () => {
    const findings = checkPlaceholders(
      plan(
        "- [ ] 1.1 Write the login form and leave a TODO for the error branch",
        "- [ ] 1.2 Write the token refresh path, the exact expiry is TBD for now",
        "- [ ] 1.3 Write the sign-out route and add error handling for the session store",
      ),
    );

    const placeholders = only(findings, "task-placeholder");

    expect(placeholders).toHaveLength(3);
    expect(placeholders.map((finding) => finding.line)).toEqual([1, 2, 3]);
    expect(placeholders.map((finding) => finding.file)).toEqual([FILE, FILE, FILE]);
    expect(placeholders.map((finding) => finding.level)).toEqual(["error", "error", "error"]);
    expect(placeholders[0]!.message).toContain("TODO");
  });
});

describe("checkPlaceholders: русские маркеры", () => {
  it("каждая из трёх задач даёт находку, и текст цитирует совпавший маркер", () => {
    const findings = checkPlaceholders(
      plan(
        "- [ ] 1.1 Написать разбор строки задачи, дальше по аналогии с задачей 3",
        "- [ ] 1.2 Написать экран входа и уточнить у пользователя формат даты",
        "- [ ] 1.3 Написать маршрут выхода и добавить обработку ошибок для сессии",
      ),
    );

    const placeholders = only(findings, "task-placeholder");

    expect(placeholders).toHaveLength(3);
    expect(placeholders.map((finding) => finding.line)).toEqual([1, 2, 3]);
    expect(placeholders[0]!.message).toContain("по аналогии");
    expect(placeholders[1]!.message).toContain("уточнить");
    expect(placeholders[2]!.message).toContain("добавить обработку ошибок");
  });
});

describe("checkPlaceholders: регистр, границы слова и «ё»", () => {
  it("маркер в верхнем регистре засчитывается", () => {
    const findings = checkPlaceholders(
      plan("- [ ] 1.1 УТОЧНИТЬ у пользователя формат даты на экране входа"),
    );

    expect(only(findings, "task-placeholder")).toHaveLength(1);
  });

  it("маркер внутри более длинного слова находки не даёт", () => {
    const inside = checkPlaceholders(
      plan(
        "- [ ] 1.1 Переделать разбор строки задачи и прогнать тест заново",
        "- [ ] 1.2 Пересчитать размеры XXXL в таблице размеров каталога",
      ),
      ["делать"],
    );

    expect(only(inside, "task-placeholder")).toEqual([]);

    const alone = checkPlaceholders(
      plan("- [ ] 1.1 Делать разбор строки задачи заново, пока не сойдётся"),
      ["делать"],
    );

    expect(only(alone, "task-placeholder")).toHaveLength(1);
  });

  it("«ё» и «е» в маркере и в тексте считаются одной буквой", () => {
    const yoInMarker = checkPlaceholders(
      plan("- [ ] 1.1 Дальше подберем оставшиеся случаи разбора строки задачи"),
      ["подберём"],
    );

    expect(only(yoInMarker, "task-placeholder")).toHaveLength(1);

    const yoInText = checkPlaceholders(
      plan("- [ ] 1.1 Дальше подберём оставшиеся случаи разбора строки задачи"),
      ["подберем"],
    );

    expect(only(yoInText, "task-placeholder")).toHaveLength(1);
  });
});

describe("checkPlaceholders: вставки в обратных кавычках", () => {
  it("маркер внутри вставки находки не даёт, а тот же маркер в тексте даёт", () => {
    const inCode = checkPlaceholders(
      plan("- [ ] 1.1 Написать разбор файла `todo-list.ts` и покрыть его тестом"),
    );

    expect(only(inCode, "task-placeholder")).toEqual([]);

    const inText = checkPlaceholders(
      plan("- [ ] 1.1 Написать разбор файла и оставить TODO на ветку ошибок"),
    );

    expect(only(inText, "task-placeholder")).toHaveLength(1);
  });
});

describe("checkPlaceholders: маркеры проекта", () => {
  const PROJECT = ["на усмотрение исполнителя"];

  it("маркер из конфигурации срабатывает", () => {
    const findings = checkPlaceholders(
      plan("- [ ] 1.1 Написать разбор строки, форма вывода на усмотрение исполнителя"),
      PROJECT,
    );

    expect(only(findings, "task-placeholder")).toHaveLength(1);
  });

  it("встроенные маркеры продолжают срабатывать рядом со списком проекта", () => {
    const findings = checkPlaceholders(
      plan("- [ ] 1.1 Написать разбор строки задачи и оставить TODO на ветку ошибок"),
      PROJECT,
    );

    expect(only(findings, "task-placeholder")).toHaveLength(1);
  });

  it("встроенный список закрыт на изменение: убрать маркер нечем", () => {
    expect(Object.isFrozen(BUILT_IN_MARKERS)).toBe(true);
    expect(BUILT_IN_MARKERS).toContain("TODO");
  });
});

describe("checkPlaceholders: признаки помимо словаря", () => {
  it("ссылка на другую задачу по номеру даёт task-points-at-task", () => {
    const findings = checkPlaceholders(
      plan(
        "- [ ] 1.1 Повторить для остальных случаев, как в задаче 5",
        "- [ ] 1.2 Написать разбор строки задачи, см. шаг 3 этого раздела",
        "- [ ] 1.3 Прогнать проверку артефактов по правилам п. 4 раздела",
        "- [ ] 1.4 Repeat the wiring for the other routes, see Task 7",
      ),
    );

    const pointing = only(findings, "task-points-at-task");

    expect(pointing).toHaveLength(4);
    expect(pointing.map((finding) => finding.line)).toEqual([1, 2, 3, 4]);
  });

  it("задача без ссылки на другую задачу находки этого правила не даёт", () => {
    const findings = checkPlaceholders(
      plan("- [ ] 1.1 Написать разбор строки задачи и покрыть его тестом"),
    );

    expect(only(findings, "task-points-at-task")).toEqual([]);
  });

  it("слишком короткая задача даёт task-too-short с названным порогом", () => {
    const findings = checkPlaceholders(plan("- [ ] 1.1 Тесты"));

    const short = only(findings, "task-too-short");

    expect(short).toHaveLength(1);
    expect(short[0]!.line).toBe(1);
    expect(short[0]!.message).toContain("30");
  });

  it("остаток шаблона даёт template-placeholder-left, а команда в кавычках — нет", () => {
    const left = checkPlaceholders(
      plan("- [ ] 1.1 Написать разбор строки задачи в <файл разбора плана>"),
    );

    expect(only(left, "template-placeholder-left")).toHaveLength(1);
    expect(only(left, "template-placeholder-left")[0]!.line).toBe(1);

    const command = checkPlaceholders(
      plan("- [ ] 1.1 Завести change вызовом `lexforge new change <name>` и проверить статус"),
    );

    expect(only(command, "template-placeholder-left")).toEqual([]);
  });
});
