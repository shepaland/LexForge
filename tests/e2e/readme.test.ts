import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { HEALTHY_NEXT_STEP } from "../../src/core/doctor/run-doctor.js";
import { TOOL_DIRECTORIES, knownTools } from "../../src/core/init/tool-registry.js";
import { readTextFile } from "../../src/core/read-text.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Разделы, которых требование «README написан для того, кто ставит» ждёт
 * от README. Читатель ставит LexForge в свой проект, и каждый заголовок
 * отвечает на один его вопрос. README на двух языках, поэтому список
 * заголовков свой у каждого файла, а порядок вопросов общий.
 */
const REQUIRED_HEADINGS: Record<string, readonly string[]> = {
  "README.md": [
    "## What the merge buys you",
    "## Supported platforms",
    "## Installation",
    "## First run",
    "## The nine skills",
    "## Commands and exit codes",
    "## What to commit",
  ],
  "README.ru.md": [
    "## Что даёт объединение",
    "## Поддерживаемые платформы",
    "## Установка",
    "## Первый запуск",
    "## Девять скиллов",
    "## Команды и коды возврата",
    "## Что коммитить",
  ],
};

const readme = Object.fromEntries(
  Object.keys(REQUIRED_HEADINGS).map((file) => [
    file,
    readTextFile(path.join(REPO_ROOT, file)),
  ]),
);

const countHeadings = (text: string): number =>
  text.split("\n").filter((line) => line.startsWith("## ")).length;

describe.each(Object.keys(REQUIRED_HEADINGS))("README для того, кто ставит: %s", (file) => {
  const text = readme[file];

  it("несёт семь обязательных заголовков разделов", () => {
    for (const heading of REQUIRED_HEADINGS[file]) {
      expect(text, `в ${file} нет заголовка «${heading}»`).toContain(`\n${heading}\n`);
    }
  });

  it("цитирует следующий шаг здоровой проверки слово в слово", () => {
    expect(text, `в ${file} нет строки следующего шага из doctor`).toContain(
      `Next step: ${HEALTHY_NEXT_STEP}`,
    );
  });

  it("называет каждый рантайм реестра и оба его каталога", () => {
    for (const tool of knownTools()) {
      const directories = TOOL_DIRECTORIES[tool];

      expect(text, `в ${file} нет имени рантайма «${tool}»`).toContain(tool);
      expect(text, `в ${file} нет каталога «${directories.project}» рантайма ${tool}`).toContain(
        directories.project,
      );
      expect(text, `в ${file} нет каталога «${directories.user}» рантайма ${tool}`).toContain(
        directories.user,
      );
    }
  });
});

describe("README на двух языках", () => {
  it("несёт одинаковое число разделов в обоих файлах", () => {
    expect(
      countHeadings(readme["README.ru.md"]),
      "разделы README.md и README.ru.md разошлись, править их нужно зеркально",
    ).toBe(countHeadings(readme["README.md"]));
  });
});

/**
 * The section on the model assignment. It is checked apart from the seven
 * headings above, because it answers a question the others do not: which model
 * each stage runs on, and how the handover happens in the runtime the reader
 * installed the skills into.
 */
const ASSIGNMENT_HEADING: Record<string, string> = {
  "README.md": "## Model assignment",
  "README.ru.md": "## Назначение моделей",
};

function assignmentSection(file: string): string {
  const text = readme[file];
  const start = text.indexOf(`\n${ASSIGNMENT_HEADING[file]}\n`);

  if (start === -1) {
    return "";
  }

  const rest = text.slice(start + 1);
  const end = rest.indexOf("\n## ", 1);

  return end === -1 ? rest : rest.slice(0, end);
}

describe.each(Object.keys(ASSIGNMENT_HEADING))("README о назначении моделей: %s", (file) => {
  it("несёт раздел назначения", () => {
    expect(assignmentSection(file), `в ${file} нет раздела назначения моделей`).not.toBe("");
  });

  it("называет три роли, default и каталог providers", () => {
    const section = assignmentSection(file);

    for (const part of ["analysis", "development", "review", "default", "providers"]) {
      expect(section, `раздел ${file} не называет «${part}»`).toContain(part);
    }
  });

  it("говорит, что проект прежней версии работает без изменений и правится вручную", () => {
    const section = assignmentSection(file);

    expect(section).toContain("lexforge init");
    expect(section).toContain("models:");
  });

  it("называет каждый рантайм реестра и способ передачи в нём", () => {
    const section = assignmentSection(file);

    for (const tool of knownTools()) {
      expect(section, `раздел ${file} не называет рантайм «${tool}»`).toContain(tool);
    }
  });
});
