import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readTextFile } from "../../src/core/read-text.js";
import { loadCatalog, shippedRulesDir } from "../../src/core/rules/catalog.js";
import { parseRules } from "../../src/core/rules/parse.js";
import { KNOWN_STACKS } from "../../src/core/rules/stacks.js";
import { checkEngineeringRules } from "../../src/core/validation/engineering-rules.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GUIDE = "docs/engineering-rules.md";

/** The marker sits on a line of its own so that a RED run can match the whole line. */
const MISSING = `${GUIDE}\nThe engineering rules guide is missing\nWrite the guide in Russian.`;

const guide = existsSync(path.join(REPO_ROOT, GUIDE))
  ? readTextFile(path.join(REPO_ROOT, GUIDE))
  : "";

/** The guide is Russian prose around code, so letters are counted outside code only. */
function proseOf(text: string): string {
  return text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, "").replace(/`[^`\n]*`/g, "");
}

function fencedBlocks(text: string): string[] {
  return [...text.matchAll(/^(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^\1[ \t]*$/gm)].map((m) => m[2]!);
}

/** The body of the `## ` section whose heading matches `heading`, or "" when there is none. */
function section(text: string, heading: RegExp): string {
  const parts = text.split(/^(?=## )/m).filter((part) => part.startsWith("## "));
  const found = parts.find((part) => heading.test(part.split("\n", 1)[0]!));
  return found ?? "";
}

const SECTIONS: ReadonlyArray<{
  name: string;
  heading: RegExp;
  mentions: Array<string | RegExp>;
}> = [
  {
    name: "the rule format and its four fields",
    heading: /формат/i,
    mentions: ["Rule", "Sign", "Applies to", "Source"],
  },
  {
    name: "how to write a Sign a reviewer can see in a diff",
    heading: /Sign/,
    mentions: [/дифф/i],
  },
  {
    name: "overriding a shipped rule by its ID",
    heading: /переопредел/i,
    mentions: ["lexforge/rules", /ID/],
  },
  {
    name: "adding a P rule",
    heading: /правило P|P-правил|P\b/,
    mentions: ["P-01", "lexforge/rules"],
  },
  {
    name: "switching a rule off with a reason",
    heading: /engineering\.disabled/,
    mentions: ["engineering.disabled", "не длиннее 200 символов"],
  },
  {
    name: "naming the stacks",
    heading: /stacks set/,
    mentions: ["lexforge stacks set", ...KNOWN_STACKS.map((stack) => stack.name)],
  },
  {
    name: "editing the rule text by the no-ai-slop-rus rules",
    heading: /no-ai-slop-rus/,
    mentions: ["no-ai-slop-rus"],
  },
];

describe("the engineering rules guide", () => {
  it("exists", () => {
    expect(guide !== "", MISSING).toBe(true);
  });

  it("is written in Russian", () => {
    const prose = proseOf(guide);
    const cyrillic = (prose.match(/[А-Яа-яЁё]/g) ?? []).length;
    const latin = (prose.match(/[A-Za-z]/g) ?? []).length;

    expect(cyrillic, MISSING).toBeGreaterThan(latin);
  });

  it.each(SECTIONS)("has a section on $name", ({ heading, mentions }) => {
    const body = section(guide, heading);

    expect(body, `${MISSING}\nNo section matches ${heading}`).not.toBe("");
    for (const part of mentions) {
      if (typeof part === "string") {
        expect(body, `The section ${heading} does not mention «${part}»`).toContain(part);
      } else {
        expect(body, `The section ${heading} does not match ${part}`).toMatch(part);
      }
    }
  });

  it("holds a rule example that parseRules reads with no error", () => {
    const examples = fencedBlocks(guide).filter((block) => /^### [A-Z]+-\d+/m.test(block));

    expect(examples.length, MISSING).toBeGreaterThan(0);
    for (const example of examples) {
      const { rules, errors } = parseRules("example.md", example);

      expect(errors).toEqual([]);
      expect(rules.length).toBeGreaterThan(0);
    }
    const ids = examples.flatMap((example) => parseRules("example.md", example).rules.map((r) => r.id));

    expect(ids.some((id) => id.startsWith("P-"))).toBe(true);
  });
});

/** Whitespace-collapsed guide text, so that a sentence wrapped over two lines still matches. */
const flat = guide.replace(/\s+/g, " ");

describe("the guide wording that the review of wave 13 asked for", () => {
  it.each([
    ["a Sign may list several constructs of one violation", /несколько конструкций одного нарушения/],
    ["a rule is split only for unrelated requirements", /только если в нём два несвязанных требования/],
    ["validate --strict where the guide sends the reader to validate", /Находки[^.]*`lexforge validate <change> --strict`|После записи запустите `lexforge validate <change> --strict`/],
    ["the duplicate check, one project file or two", /в одном проектном файле или в двух/],
    ["validate --strict flags the duplicate", /`validate --strict` отметит/],
    ["validate --strict checks the stack names", /То же проверяет `validate --strict`/],
    ["the RV rules reach the reviewer for any files", /`RV`[^.]*для любых файлов[^.]*`Applies to`/],
    ["an override turns a stack rule on", /даже если стек не назван/],
    ["the shipped rules are English", /Поставляемые правила написаны по-английски/],
    ["English rule text is edited with no-ai-slop", /английский текст[^.]*`no-ai-slop`/i],
    ["validate --strict checks what it really checks", /`lexforge validate <change> --strict` проверяет формат правил, повторы ID, неизвестные ID, причины отключения и названия стеков/],
  ])("says that %s", (_name, pattern) => {
    expect(flat, `${MISSING}\nThe guide has no text matching ${pattern}`).toMatch(pattern);
  });

  it.each([
    ["a bare validate", /`validate`/],
    ["the claim that validate checks everything", /Всё написанное здесь проверяет/],
    ["the one-sign-one-feature bullet", /Правило с двумя признаками разбейте/],
    ["чего instead of что", /чего никто/],
    ["the colon reveal on duplicates", /двух проектных файлах: /],
    ["the aphorism about the ID typo", /Так опечатка в ID/],
    ["the aphorism about arguing", /остаётся спорить/],
  ])("does not keep %s", (_name, pattern) => {
    expect(guide, `${MISSING}\nThe guide still matches ${pattern}`).not.toMatch(pattern);
  });
});

describe("the guide examples against the real checks", () => {
  it("passes the yaml example through the engineering settings check with no finding", () => {
    const yaml = fencedBlocks(guide).find((block) => /^engineering:/m.test(block));

    expect(yaml, `${MISSING}\nNo fenced yaml block with engineering:`).toBeDefined();
    expect(yaml).toContain("disabled:");
    const root = makeWorkspace({ "lexforge/config.yaml": `schema: spec-driven\n${yaml}` });
    try {
      expect(checkEngineeringRules(root, shippedRulesDir())).toEqual([]);
    } finally {
      removeWorkspace(root);
    }
  });

  it("uses only shipped IDs outside the P group in its examples", () => {
    const root = makeWorkspace({});
    try {
      const shipped = new Set(
        loadCatalog({ root, stacks: KNOWN_STACKS.map((stack) => stack.name), disabled: {} }).map((rule) => rule.id),
      );
      const ids = fencedBlocks(guide).flatMap((block) => [
        ...[...block.matchAll(/^### ([A-Z]+-\d+)\s*$/gm)].map((m) => m[1]!),
        ...[...block.matchAll(/^\s+([A-Z]+-\d+):/gm)].map((m) => m[1]!),
      ]);
      const others = ids.filter((id) => !id.startsWith("P-"));

      expect(others.length, MISSING).toBeGreaterThan(0);
      for (const id of others) {
        expect(shipped.has(id), `The example uses ${id}, which no shipped rule file defines`).toBe(true);
      }
    } finally {
      removeWorkspace(root);
    }
  });
});

describe.each(["README.md", "README.ru.md"])("%s and the engineering rules", (file) => {
  const text = readTextFile(path.join(REPO_ROOT, file));
  const heading = file === "README.md" ? /^## First run$/ : /^## Первый запуск$/;
  const commands = file === "README.md" ? /^## Commands and exit codes$/ : /^## Команды и коды возврата$/;

  it("links to the guide", () => {
    expect(text, `${file} has no link to ${GUIDE}`).toMatch(/\]\((\.\/)?docs\/engineering-rules\.md[^)]*\)/);
  });

  it("has a First run step that runs lexforge stacks set", () => {
    expect(section(text, heading), `${file}: First run has no stacks step`).toContain("lexforge stacks set");
  });

  it("has command table rows for rules and stacks set", () => {
    const table = section(text, commands);

    expect(table, `${file}: no row for rules`).toMatch(/^\| `rules\b[^`]*` \|/m);
    expect(table, `${file}: no row for stacks set`).toMatch(/^\| `stacks set\b[^`]*` \|/m);
  });
});
