import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { TOOL_DIRECTORIES, knownTools } from "../../src/core/init/tool-registry.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Разделы, которых требование «README написан для того, кто ставит» ждёт
 * от README. Читатель ставит LexForge в свой проект, и каждый заголовок
 * отвечает на один его вопрос.
 */
const REQUIRED_HEADINGS = [
  "## Что делает LexForge",
  "## Требования",
  "## Установка",
  "## Первый запуск",
  "## Девять скиллов",
  "## Команды и коды возврата",
  "## Что коммитить",
];

const readme = readFileSync(path.join(REPO_ROOT, "README.md"), "utf8");

describe("README для того, кто ставит", () => {
  it("несёт семь обязательных заголовков разделов", () => {
    for (const heading of REQUIRED_HEADINGS) {
      expect(readme, `в README нет заголовка «${heading}»`).toContain(`\n${heading}\n`);
    }
  });

  it("называет каждый рантайм реестра и оба его каталога", () => {
    for (const tool of knownTools()) {
      const directories = TOOL_DIRECTORIES[tool];

      expect(readme, `в README нет имени рантайма «${tool}»`).toContain(tool);
      expect(readme, `в README нет каталога «${directories.project}» рантайма ${tool}`).toContain(
        directories.project,
      );
      expect(readme, `в README нет каталога «${directories.user}» рантайма ${tool}`).toContain(
        directories.user,
      );
    }
  });
});
