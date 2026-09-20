import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readTextFile } from "../../src/core/read-text.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * The line-limit section answers what `file_limit` covers and what
 * `check plan`/`verify` refuse over it — the question a reader has right
 * before the general limits section. Placement, not a cross-reference, is
 * what fixes the order the reader meets the two in.
 */
const SECTION_HEADING: Record<string, string> = {
  "README.md": "## Line limit",
  "README.ru.md": "## Предел длины файла",
};

const FOLLOWING_HEADING: Record<string, string> = {
  "README.md": "## Limits",
  "README.ru.md": "## Границы",
};

const readme = Object.fromEntries(
  Object.keys(SECTION_HEADING).map((file) => [file, readTextFile(path.join(REPO_ROOT, file))]),
);

function sectionAndNext(file: string): { section: string; next: string } {
  const text = readme[file];
  const heading = SECTION_HEADING[file];
  const start = text.indexOf(`\n${heading}\n`);

  if (start === -1) {
    return { section: "", next: "" };
  }

  const rest = text.slice(start + 1);
  const end = rest.indexOf("\n## ", 1);
  const section = end === -1 ? rest : rest.slice(0, end);
  const next = end === -1 ? "" : rest.slice(end + 1).split("\n", 1)[0];

  return { section, next };
}

const REQUIRED_TERMS = [
  "file_limit",
  "lines",
  "include",
  "400",
  "long_files",
  "refactor",
  "keep",
  "lexforge check plan",
  "lexforge verify",
  "!src/generated/**",
];

describe.each(Object.keys(SECTION_HEADING))("README о пределе длины файла: %s", (file) => {
  it("несёт раздел о пределе длины файла", () => {
    const { section } = sectionAndNext(file);

    expect(section, `в ${file} нет раздела «${SECTION_HEADING[file]}»`).not.toBe("");
  });

  it("стоит прямо перед разделом общих ограничений", () => {
    const { next } = sectionAndNext(file);

    expect(
      next,
      `в ${file} раздел предела не стоит прямо перед «${FOLLOWING_HEADING[file]}»`,
    ).toBe(FOLLOWING_HEADING[file]);
  });

  it("называет ключевые термины предела длины файла", () => {
    const { section } = sectionAndNext(file);

    for (const term of REQUIRED_TERMS) {
      expect(section, `раздел ${file} не называет «${term}»`).toContain(term);
    }
  });
});
