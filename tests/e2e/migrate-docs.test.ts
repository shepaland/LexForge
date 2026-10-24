import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readTextFile } from "../../src/core/read-text.js";
import { projectConfigText } from "../../src/core/init/config-template.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** A missing file reads as empty text, so a doc dropped before the guide was
 * written fails the clause assertions below instead of crashing the suite. */
function readIfExists(file: string): string {
  try {
    return readTextFile(file);
  } catch {
    return "";
  }
}

const README_EN = readIfExists(path.join(REPO_ROOT, "README.md"));
const README_RU = readIfExists(path.join(REPO_ROOT, "README.ru.md"));
const GUIDE = readIfExists(path.join(REPO_ROOT, "docs", "task-execution.md"));
const CHANGELOG = readIfExists(path.join(REPO_ROOT, "CHANGELOG.md"));
const EXECUTION_CONTEXT = path.join(REPO_ROOT, "docs", "execution-context.md");

/**
 * Markdown prose wraps at a column width, so two words of one sentence can sit
 * on either side of a hard line break. A phrase regex with a literal space
 * between words would then miss a true positive at the wrap point, which is
 * not what any of these checks are testing for. Flattened text folds every
 * run of whitespace - including the line break - to one space, so a phrase
 * check depends only on the words of the sentence, never on where the editor
 * happened to wrap the line. The line-anchored checks below (the fenced
 * `lexforge migrate` line) read the raw text instead: there the line break
 * itself is the fact under test.
 */
function flatten(text: string): string {
  return text.replace(/\s+/g, " ");
}

const README_EN_FLAT = flatten(README_EN);
const README_RU_FLAT = flatten(README_RU);
const GUIDE_FLAT = flatten(GUIDE);

const RAW_GUIDE_URL = "https://raw.githubusercontent.com/shepaland/LexForge/main/docs/task-execution.md";

/** The eleven commands the two command tables and the walk of the guide must name. */
const ELEVEN_COMMANDS = [
  "task start",
  "task red",
  "task green",
  "task review",
  "task close",
  "task abandon",
  "plan review",
  "plan approve",
  "plan amend",
  "plan escalate",
  "review final",
];

/**
 * Command forms 6.0.0 removes. Checked as bare substrings, "however they are
 * prefixed" (the brief's own words): a form reappearing under a new sentence,
 * not only on the old line, still fails this. `evidence record` and the bare
 * word "cycle" used as history are not in this list on purpose - only the
 * exact removed invocations are.
 */
const REMOVED_FORMS = [
  "cycle start",
  "cycle run",
  "cycle review",
  "cycle close",
  "cycle restart",
  "context --change",
  "workflow migrate",
  "evidence red",
];

const DOCS: ReadonlyArray<readonly [string, string]> = [
  ["README.md", README_EN],
  ["README.ru.md", README_RU],
  ["docs/task-execution.md", GUIDE],
];

/** Slices the text between `heading` and the next line starting with `## `. */
function section(text: string, heading: string): string {
  const start = text.indexOf(`\n${heading}\n`);
  if (start === -1) return "";
  const rest = text.slice(start + heading.length + 2);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
}

/** The first `## <version> — <date>` entry of CHANGELOG.md, header included. */
function topChangelogEntry(text: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.startsWith("## "));
  if (start === -1) return "";
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

describe("docs/execution-context.md удалён вместе с циклами, которые он описывал", () => {
  it("файл больше не существует", () => {
    expect(existsSync(EXECUTION_CONTEXT), "docs/execution-context.md ещё лежит в репозитории").toBe(false);
  });
});

describe.each(DOCS)("%s: не несёт форму удалённой команды", (name, text) => {
  it.each(REMOVED_FORMS)("форма «%s» не встречается, как бы она ни была написана", (form) => {
    expect(
      text.toLowerCase(),
      `${name} всё ещё несёт удалённую форму «${form}»: перепишите место, где она появилась, на форму 6.0.0`,
    ).not.toContain(form.toLowerCase());
  });
});

describe.each(DOCS)("%s: называет все одиннадцать команд пути задачи", (name, text) => {
  it.each(ELEVEN_COMMANDS)("команда «%s» названа как вызов, не только по имени", (command) => {
    // Экранированная форма команды ищется сразу после открывающей кавычки кода
    // (`` `task start `` или `` `lexforge task start ``), а не где угодно в
    // тексте: так абзац, который предостерегает от команды, не засчитывается
    // за то, что её называет.
    const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const asInvocation = new RegExp("`(?:lexforge )?" + escaped + "\\b");
    expect(asInvocation.test(text), `${name} не называет «${command}» как вызов команды в обратных кавычках`).toBe(
      true,
    );
  });
});

describe("README.md: объясняет миграцию 5.x на 6.0.0 по-английски", () => {
  it("отказ несёт код change-needs-migration рядом со словом «refuses»", () => {
    expect(README_EN_FLAT).toMatch(/refuses with `change-needs-migration`/i);
  });

  it("говорит, что установка 6.0.0 сама не переносит ни одного изменения — именно с отрицанием «no»", () => {
    // Инверсия «migrates every existing change by itself» не содержит «no
    // existing change» и провалит эту проверку, тогда как проверка на одно
    // лишь слово «migrates» прошла бы её тоже.
    expect(README_EN_FLAT).toMatch(/migrates no existing change by itself/i);
  });

  it("говорит, что до миграции ничего не записывается — с отрицанием «nothing»", () => {
    expect(README_EN_FLAT).toMatch(/writes nothing until the migration runs/i);
  });

  it("несёт `lexforge migrate --change <name>` на отдельной строке", () => {
    expect(README_EN).toMatch(/^lexforge migrate --change <name>$/m);
  });

  it("делит задачи на исторические и открытые, не наоборот", () => {
    // Раздельные проверки на «closed → historical» и «rest → open» ловят
    // перестановку: текст, в котором открытые задачи стали бы историческими,
    // не пройдёт первую проверку, даже если слово «historical» осталось.
    expect(README_EN_FLAT).toMatch(/closed work becomes historical tasks/i);
    expect(README_EN_FLAT).toMatch(/rest stays open/i);
  });

  it("называет missingFields", () => {
    expect(README_EN).toContain("missingFields");
  });

  it("говорит, что открытая часть идёт через ревью плана и подтверждение владельца", () => {
    expect(README_EN_FLAT).toMatch(/open part goes through plan review and owner approval/i);
  });

  it("ссылается на руководство по своей raw-ссылке, а не по относительному пути", () => {
    expect(README_EN).toContain(RAW_GUIDE_URL);
  });
});

describe("README.ru.md: объясняет миграцию 5.x на 6.0.0 по-русски", () => {
  it("отказ несёт код change-needs-migration рядом со словом «отказывает»", () => {
    expect(README_RU_FLAT).toMatch(/отказывает кодом `change-needs-migration`/);
  });

  it("говорит, что установка 6.0.0 сама не переносит изменения — именно с отрицанием «не»", () => {
    expect(README_RU_FLAT).toMatch(/сама не переносит ни одного существующего изменения/);
  });

  it("говорит, что до миграции ничего не записывается — с отрицанием «не пишет»", () => {
    expect(README_RU_FLAT).toMatch(/не пишет ничего, пока не прошла миграция/);
  });

  it("несёт `lexforge migrate --change <name>` на отдельной строке", () => {
    expect(README_RU).toMatch(/^lexforge migrate --change <name>$/m);
  });

  it("делит задачи на исторические и открытые, не наоборот", () => {
    expect(README_RU_FLAT).toMatch(/становится историческими задачами/);
    expect(README_RU_FLAT).toMatch(/остальное остаётся открытым/);
  });

  it("называет missingFields", () => {
    expect(README_RU).toContain("missingFields");
  });

  it("говорит, что открытая часть идёт через ревью плана и подтверждение владельца", () => {
    expect(README_RU_FLAT).toMatch(/открытая часть плана проходит ревью и подтверждение владельца/);
  });

  it("ссылается на руководство по своей raw-ссылке, а не по относительному пути", () => {
    expect(README_RU).toContain(RAW_GUIDE_URL);
  });
});

describe("docs/task-execution.md: тот же разбор миграции, что и в обоих README", () => {
  it("отказ несёт код change-needs-migration рядом со словом «отказывает»", () => {
    expect(GUIDE_FLAT).toMatch(/отказывает кодом `change-needs-migration`/);
  });

  it("говорит, что установка 6.0.0 сама не переносит изменения — именно с отрицанием «не»", () => {
    expect(GUIDE_FLAT).toMatch(/сама не переносит ни одного существующего изменения/);
  });

  it("говорит, что до миграции ничего не записывается — с отрицанием «не пишет»", () => {
    expect(GUIDE_FLAT).toMatch(/не пишет ничего, пока не прошла миграция/);
  });

  it("несёт `lexforge migrate --change <name>` на отдельной строке", () => {
    expect(GUIDE).toMatch(/^lexforge migrate --change <name>$/m);
  });

  it("делит задачи на исторические и открытые, не наоборот", () => {
    expect(GUIDE_FLAT).toMatch(/становится историческими задачами/);
    expect(GUIDE_FLAT).toMatch(/остальное остаётся открытым/);
  });

  it("называет missingFields", () => {
    expect(GUIDE).toContain("missingFields");
  });

  it("говорит, что открытая часть идёт через ревью плана и подтверждение владельца", () => {
    expect(GUIDE_FLAT).toMatch(/открытая часть плана проходит ревью и подтверждение владельца/);
  });

  it("проходит путь задачи от ревью плана до архивации в этом порядке", () => {
    // Порядок, а не только присутствие слов: инверсия, которая переставила бы
    // шаги местами, не пройдёт этот индекс-тест, хотя все слова остались бы на
    // месте.
    const order = [
      "plan review",
      "plan approve",
      "task start",
      "task red",
      "task green",
      "task review",
      "task close",
      "review final",
      "lexforge verify",
      "lexforge archive",
    ];
    const positions = order.map((step) => GUIDE.indexOf(step));

    expect(positions.every((position) => position !== -1), "один из шагов разбора отсутствует").toBe(true);
    for (let index = 1; index < positions.length; index += 1) {
      expect(
        positions[index]! > positions[index - 1]!,
        `шаг «${order[index]}» стоит раньше «${order[index - 1]}», хотя разбор идёт в другом порядке`,
      ).toBe(true);
    }
  });

  it("называет три выхода на владельца: task abandon, plan amend, plan escalate", () => {
    expect(GUIDE).toMatch(/task abandon/);
    expect(GUIDE).toMatch(/plan amend/);
    expect(GUIDE).toMatch(/plan escalate/);
  });
});

describe("CHANGELOG.md: верхняя запись одна называет миграцию и удалённые команды", () => {
  const top = topChangelogEntry(CHANGELOG);

  it("верхняя запись помечена версией 6.0.0", () => {
    expect(top).toMatch(/^## 6\.0\.0 —/);
  });

  it("называет lexforge migrate", () => {
    expect(top).toMatch(/lexforge migrate/);
  });

  it.each(["cycle", "context", "workflow migrate", "evidence red"])(
    "называет удалённую команду «%s»",
    (removed) => {
      expect(top.toLowerCase(), `верхняя запись CHANGELOG.md не называет «${removed}»`).toContain(
        removed.toLowerCase(),
      );
    },
  );
});

/** The heading of the command table, one per language. */
const TABLE_HEADING: Record<string, string> = {
  "README.md": "## Commands and exit codes",
  "README.ru.md": "## Команды и коды возврата",
};

describe("README на двух языках: командная таблица несёт те же одиннадцать команд", () => {
  it.each(Object.entries(TABLE_HEADING))("таблица %s содержит каждую из одиннадцати команд строкой", (file, heading) => {
    const text = file === "README.md" ? README_EN : README_RU;
    const table = section(text, heading);

    expect(table, `в ${file} нет раздела «${heading}»`).not.toBe("");

    for (const command of ELEVEN_COMMANDS) {
      const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(table, `в таблице команд ${file} нет строки «${command}»`).toMatch(new RegExp("\\| `" + escaped + "\\b"));
    }
  });
});

/** The three commands 6.0.0 adds, which the two README command tables must gain a row for. */
const NEW_COMMANDS = ["migrate", "journal", "unlock"];

describe("README на двух языках: командная таблица несёт три новые команды", () => {
  it.each(Object.entries(TABLE_HEADING))("таблица %s содержит каждую из трёх новых команд строкой", (file, heading) => {
    const text = file === "README.md" ? README_EN : README_RU;
    const table = section(text, heading);

    expect(table, `в ${file} нет раздела «${heading}»`).not.toBe("");

    for (const command of NEW_COMMANDS) {
      const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(table, `в таблице команд ${file} нет строки «${command}»`).toMatch(new RegExp("\\| `" + escaped + "\\b"));
    }
  });
});

/** Claims 6.0.0 drops from the READMEs because the behaviour they described is gone. One shape, tabled. */
const REMOVED_README_CLAIMS: ReadonlyArray<{ file: string; text: string; phrase: string }> = [
  { file: "README.md", text: README_EN_FLAT.toLowerCase(), phrase: "group labels" },
  { file: "README.md", text: README_EN_FLAT.toLowerCase(), phrase: "shared by groups" },
  { file: "README.md", text: README_EN_FLAT.toLowerCase(), phrase: "files of a cycle" },
  { file: "README.md", text: README_EN_FLAT.toLowerCase(), phrase: "cycle prerequisites" },
  { file: "README.ru.md", text: README_RU_FLAT, phrase: "метки групп" },
  { file: "README.ru.md", text: README_RU_FLAT, phrase: "общие файлы у групп" },
  { file: "README.ru.md", text: README_RU_FLAT, phrase: "файлам цикла" },
  { file: "README.ru.md", text: README_RU_FLAT, phrase: "условия цикла" },
];

describe("README на двух языках: обещание меток групп снято, файлы задачи не зовутся файлами цикла", () => {
  it.each(REMOVED_README_CLAIMS)("$file не несёт «$phrase»", ({ file, text, phrase }) => {
    expect(text, `${file} всё ещё несёт «${phrase}»`).not.toContain(phrase);
  });
});

/**
 * What a reader needs about `worktree.setup`: what it holds, that `task start`
 * runs it in the new worktree, and - since `red-run-broken` names two different
 * fixes - which of its two causes each fix answers.
 */
const WORKTREE_SETUP_FACTS: ReadonlyArray<{ label: string; en: RegExp; ru: RegExp }> = [
  { label: "ключ держит команду оболочки", en: /`worktree\.setup`: a shell command/, ru: /`worktree\.setup`: команду оболочки/ },
  { label: "task start запускает её один раз в новом рабочем дереве", en: /that `task start` runs once in the new worktree/, ru: /которую `task start` один раз запускает в новом рабочем дереве/ },
  { label: "ненулевой код завершения убирает дерево кодом worktree-setup-failed", en: /a non-zero exit removes the worktree and refuses with `worktree-setup-failed`/, ru: /при ненулевом коде завершения `task start` удаляет рабочее дерево и отказывает кодом `worktree-setup-failed`/ },
  { label: "red-run-broken при нехватке зависимостей советует worktree.setup", en: /refuses with `red-run-broken`: when the worktree is missing what `worktree\.setup` installs, the fix is `worktree\.setup`/, ru: /отказывает кодом `red-run-broken`: когда в рабочем дереве не хватает того, что ставит `worktree\.setup`, отказ советует задать его/ },
  { label: "red-run-broken при незаявленном модуле советует plan amend", en: /when the break names a module the task never declared, the fix is `lexforge plan amend` instead/, ru: /когда разбор называет модуль, который задача не объявила в `Files:`, отказ советует `lexforge plan amend`/ },
];

describe("README.md объясняет worktree.setup по-английски", () => {
  it.each(WORKTREE_SETUP_FACTS)("$label", ({ en }) => {
    expect(README_EN_FLAT).toMatch(en);
  });
});

const RU_DOCS_WITH_WORKTREE_SETUP: ReadonlyArray<readonly [string, string]> = [
  ["README.ru.md", README_RU_FLAT],
  ["docs/task-execution.md", GUIDE_FLAT],
];

describe.each(RU_DOCS_WITH_WORKTREE_SETUP)("%s объясняет worktree.setup по-русски", (name, text) => {
  it.each(WORKTREE_SETUP_FACTS)("$label", ({ ru }) => {
    expect(text, `${name} не говорит это по-русски`).toMatch(ru);
  });
});

describe("src/core/init/config-template.ts: закомментированный пример worktree.setup попадает в каждый новый config.yaml", () => {
  const template = projectConfigText();

  it("объясняет, что ключ — команда, которую `task start` запускает в новом рабочем дереве задачи", () => {
    expect(template).toContain(
      "# worktree.setup: the command `task start` runs in a new task worktree",
    );
  });

  it("несёт закомментированный пример `worktree: setup: npm ci`", () => {
    expect(template).toMatch(/^# worktree:\n# {2}setup: npm ci$/m);
  });
});
