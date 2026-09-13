import { describe, expect, it } from "vitest";

import { parseTaskList } from "../../../src/core/gates/task-list.js";

const PLAN = [
  "## 1. Разбор плана",
  "",
  "- [ ] 1.1 Написать падающий тест `tests/core/gates/task-list.test.ts` на список задач",
  "- [x] 1.2 Прогнать тест и увидеть падение: модуля разбора плана ещё нет",
  "",
  "## 2. Правила самопроверки",
  "",
  "- [ ] 2.1 Написать модуль `src/core/gates/placeholder-rules.ts` со списком маркеров",
  "- [X] 2.2 Прогнать тест и увидеть, что он проходит",
  "",
].join("\n");

describe("parseTaskList", () => {
  it("находит четыре задачи и не считает задачей строку раздела", () => {
    const tasks = parseTaskList(PLAN);

    expect(tasks.map((task) => task.number)).toEqual(["1.1", "1.2", "2.1", "2.2"]);
    expect(tasks.map((task) => task.line)).toEqual([3, 4, 8, 9]);
    expect(tasks.map((task) => task.done)).toEqual([false, true, false, true]);
    expect(tasks[0]!.text).toContain("Написать падающий тест");
    expect(tasks[0]!.text).not.toContain("1.1");
  });

  it("отметка закрытия читается в любом регистре", () => {
    const tasks = parseTaskList(
      [
        "- [ ] 1.1 Написать разбор списка задач и покрыть его тестом",
        "- [x] 1.2 Прогнать тест и увидеть, что он проходит",
        "- [X] 1.3 Прогнать сборку и увидеть, что она проходит",
      ].join("\n"),
    );

    expect(tasks.map((task) => task.done)).toEqual([false, true, true]);
  });

  it("задача из трёх строк даёт один элемент с текстом через пробел", () => {
    const tasks = parseTaskList(
      [
        "## 1. Раздел",
        "",
        "- [ ] 1.1 Написать падающий тест на список задач",
        "      и прогнать его в каталоге `tests/core/gates`,",
        "      увидев падение своими глазами",
        "- [ ] 1.2 Написать разбор строки задачи",
      ].join("\n"),
    );

    expect(tasks).toHaveLength(2);
    expect(tasks[0]!.line).toBe(3);
    expect(tasks[0]!.text).toBe(
      "Написать падающий тест на список задач и прогнать его в каталоге " +
        "`tests/core/gates`, увидев падение своими глазами",
    );
  });
});

describe("parseTaskList: ссылки на требования", () => {
  it("строка со стрелкой даёт разобранные путь и имя требования", () => {
    const tasks = parseTaskList(
      [
        "- [ ] 1.1 Написать разбор ссылки в `src/core/gates/task-list.ts`",
        "      -> plan-selfcheck#Каждое требование дельты названо задачей",
      ].join("\n"),
    );

    expect(tasks[0]!.links).toEqual([
      { capability: "plan-selfcheck", requirement: "Каждое требование дельты названо задачей" },
    ]);
  });

  it("две ссылки на разных строках дают два элемента", () => {
    const tasks = parseTaskList(
      [
        "- [ ] 1.1 Написать разбор ссылки в `src/core/gates/task-list.ts`",
        "      -> plan-selfcheck#Каждое требование дельты названо задачей",
        "      -> gate-command-contract#Четыре команды-ворота",
      ].join("\n"),
    );

    expect(tasks[0]!.links).toEqual([
      { capability: "plan-selfcheck", requirement: "Каждое требование дельты названо задачей" },
      { capability: "gate-command-contract", requirement: "Четыре команды-ворота" },
    ]);
  });

  it("строка без стрелки ссылок не даёт", () => {
    const tasks = parseTaskList(
      "- [ ] 1.1 Написать разбор ссылки в `src/core/gates/task-list.ts` и прогнать тест\n",
    );

    expect(tasks[0]!.links).toEqual([]);
  });
});

describe("parseTaskList: имена файлов", () => {
  it("пути берутся из вставок в обратных кавычках", () => {
    const tasks = parseTaskList(
      [
        "- [ ] 1.1 Написать `src/core/gates/task-list.ts`, дописать `README.md`",
        "      и прогнать `npm test`; файл config.yaml без кавычек путём не считается",
      ].join("\n"),
    );

    expect(tasks[0]!.files).toEqual(["src/core/gates/task-list.ts", "README.md"]);
  });

  it("поле в обратных кавычках без слэша путём не считается", () => {
    const tasks = parseTaskList(
      [
        "- [ ] 1.1 Записать находку через `finding.rule` и прочитать `task.line`,",
        "      сверить с `data.summary.openDefects`, не трогая `src/core/gates/plan-check.ts`",
      ].join("\n"),
    );

    expect(tasks[0]!.files).toEqual(["src/core/gates/plan-check.ts"]);
  });

  it("расширение из допустимого списка без слэша всё ещё считается путём", () => {
    const tasks = parseTaskList(
      "- [ ] 1.1 Написать правило в `coverage-rules.ts` и обновить `tasks.md`\n",
    );

    expect(tasks[0]!.files).toEqual(["coverage-rules.ts", "tasks.md"]);
  });

  it("расширения других языков и экосистем тоже считаются путём без слэша", () => {
    const tasks = parseTaskList(
      [
        "- [ ] 1.1 Правь `setup.py`, `main.go`, `lib.rs`, `app.rb`, `Main.java`,",
        "      `styles.css`, `index.html`, `schema.sql`, `util.c`, `util.h`, `util.cpp`,",
        "      `Program.cs`, `index.php`, `App.swift`, `Main.kt`, `theme.scss`,",
        "      `config.toml`, `settings.ini`, `data.xml`, `rows.csv`",
      ].join("\n"),
    );

    expect(tasks[0]!.files).toEqual([
      "setup.py",
      "main.go",
      "lib.rs",
      "app.rb",
      "Main.java",
      "styles.css",
      "index.html",
      "schema.sql",
      "util.c",
      "util.h",
      "util.cpp",
      "Program.cs",
      "index.php",
      "App.swift",
      "Main.kt",
      "theme.scss",
      "config.toml",
      "settings.ini",
      "data.xml",
      "rows.csv",
    ]);
  });

  it("расширения, выпавшие при сужении списка, снова считаются путём", () => {
    const tasks = parseTaskList(
      [
        "- [ ] 1.1 Правь `App.jsx`, `App.vue`, `main.tf`, `app.dart`, `init.lua`,",
        "      `script.pl`, `deploy.ps1`, `guide.mdx`, `lib.exs`, `Main.hs`, `core.clj`,",
        "      `paper.tex`, `service.proto`, `App.scala`",
      ].join("\n"),
    );

    expect(tasks[0]!.files).toEqual([
      "App.jsx",
      "App.vue",
      "main.tf",
      "app.dart",
      "init.lua",
      "script.pl",
      "deploy.ps1",
      "guide.mdx",
      "lib.exs",
      "Main.hs",
      "core.clj",
      "paper.tex",
      "service.proto",
      "App.scala",
    ]);
  });

  it("расширение без слэша считается путём независимо от регистра", () => {
    const tasks = parseTaskList("- [ ] 1.1 Читай `README.MD` и обнови `Main.JAVA`\n");

    expect(tasks[0]!.files).toEqual(["README.MD", "Main.JAVA"]);
  });

  it("расширения, которых не было во втором списке, тоже считаются путём", () => {
    const tasks = parseTaskList(
      [
        "- [ ] 1.1 Правь `styles.less`, `theme.sass`, `page.styl`, `notes.rst`,",
        "      `rows.tsv`, `run.bat`, `app.cfg`, `service.conf`, `.env`, `deps.lock`,",
        "      `main.ex`, `worker.erl`, `script.jl`, `analysis.ipynb`, `App.svelte`",
      ].join("\n"),
    );

    expect(tasks[0]!.files).toEqual([
      "styles.less",
      "theme.sass",
      "page.styl",
      "notes.rst",
      "rows.tsv",
      "run.bat",
      "app.cfg",
      "service.conf",
      ".env",
      "deps.lock",
      "main.ex",
      "worker.erl",
      "script.jl",
      "analysis.ipynb",
      "App.svelte",
    ]);
  });
});

describe("parseTaskList: namedFiles не путает программу команды с файлом", () => {
  it("голый путь без пробелов в обратных кавычках остаётся именованным, как и раньше", () => {
    const tasks = parseTaskList("- [ ] 1.1 Смотри `tests/core/gates/x.test.ts` без команды\n");

    expect(tasks[0]!.namedFiles).toEqual(["tests/core/gates/x.test.ts"]);
  });

  it("программа обёрнутого evidence red не попадает в namedFiles, а файл под ней попадает", () => {
    const tasks = parseTaskList(
      '- [ ] 1.1 Check: `node bin/lexforge.js evidence red --change c --task 1.2 --command "npx vitest run tests/core/gates/x.test.ts"`\n',
    );

    expect(tasks[0]!.namedFiles).toEqual(["tests/core/gates/x.test.ts"]);
    expect(tasks[0]!.namedFiles).not.toContain("bin/lexforge.js");
  });

  it("каждый путь, которым командует программа, остаётся именованным", () => {
    const tasks = parseTaskList(
      "- [ ] 1.1 Check: `npx vitest run tests/core/gates/a.test.ts tests/core/gates/b.test.ts`\n",
    );

    expect(tasks[0]!.namedFiles).toEqual([
      "tests/core/gates/a.test.ts",
      "tests/core/gates/b.test.ts",
    ]);
  });

  it("команда без единого аргумента после программы не именует ничего", () => {
    const tasks = parseTaskList("- [ ] 1.1 Check: `node scripts/build.js`\n");

    expect(tasks[0]!.namedFiles).toEqual([]);
  });
});

describe("parseTaskList: текст без служебных частей", () => {
  it("номера и ссылки на требование в очищенный текст не входят", () => {
    const tasks = parseTaskList(
      [
        "- [ ] 3.4 Написать разбор ссылки в `src/core/gates/task-list.ts`",
        "      -> plan-selfcheck#Каждое требование дельты названо задачей",
      ].join("\n"),
    );

    expect(tasks[0]!.cleanText).toBe("Написать разбор ссылки в `src/core/gates/task-list.ts`");
    expect(tasks[0]!.cleanText).not.toContain("3.4");
    expect(tasks[0]!.cleanText).not.toContain("plan-selfcheck");
  });

  it("ссылка в конце строки с текстом убирает только себя", () => {
    const tasks = parseTaskList(
      "- [ ] 3.5 Прогнать тест `npm test` -> plan-selfcheck#Находка называет место\n",
    );

    expect(tasks[0]!.cleanText).toBe("Прогнать тест `npm test`");
  });
});

describe("parseTaskList: таблица распознавания пути по расширению", () => {
  it.each([
    ["App.jsx", true],
    ["main.tf", true],
    ["mix.exs", true],
    ["README.MD", true],
    ["setup.py", true],
    ["npm test", false],
    ["finding.rule", false],
    ["data.summary.openDefects", false],
  ])("«%s» распознаётся как путь: %s", (span, expected) => {
    const tasks = parseTaskList(`- [ ] 1.1 Правь \`${span}\`\n`);

    expect(tasks[0]!.files.includes(span)).toBe(expected);
  });
});
