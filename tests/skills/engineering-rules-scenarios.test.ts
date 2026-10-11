import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { shippedRulesDir } from "../../src/core/rules/catalog.js";
import { parseRules } from "../../src/core/rules/parse.js";
import { GENERAL_SECTIONS, KNOWN_STACKS } from "../../src/core/rules/stacks.js";

const EXPECTED = "\nThe engineering rules scenarios are missing\n";
const SCENARIOS = fileURLToPath(new URL("../scenarios", import.meta.url));
const HEADINGS = ["## Setting", "## Options", "## Pressures", "## What counts as a violation"];
const FRONTEND_STACKS = ["react", "vue", "angular", "svelte"];

interface Scenario {
  skill: string;
  name: string;
  /** The general section whose rule IDs the Setting quotes; absent for the guide. */
  layer?: string;
  /** The stack additions of that layer whose rule IDs the Setting quotes. */
  stacks: string[];
}

const SCENARIO_LIST: Scenario[] = [
  {
    skill: "lexforge-apply",
    name: "engineering-rules-backend.md",
    layer: "backend",
    stacks: KNOWN_STACKS.filter((s) => !FRONTEND_STACKS.includes(s.name)).map((s) => s.name),
  },
  {
    skill: "lexforge-apply",
    name: "engineering-rules-frontend.md",
    layer: "frontend",
    stacks: KNOWN_STACKS.filter((s) => FRONTEND_STACKS.includes(s.name)).map((s) => s.name),
  },
  { skill: "lexforge-apply", name: "engineering-rules-testing.md", layer: "testing", stacks: [] },
  { skill: "lexforge", name: "stacks-guess-from-files.md", stacks: [] },
];

function read(scenario: Scenario): string | undefined {
  const file = path.join(SCENARIOS, scenario.skill, scenario.name);

  return existsSync(file) ? readFileSync(file, "utf8") : undefined;
}

function section(text: string, heading: string): string {
  const start = text.indexOf(`\n${heading}\n`);
  if (start < 0) return "";
  const rest = text.slice(start + heading.length + 2);
  const next = rest.search(/\n## /);

  return next < 0 ? rest : rest.slice(0, next);
}

function shippedIds(file: string): string[] {
  const text = readFileSync(path.join(shippedRulesDir(), file), "utf8");

  return parseRules(file, text).rules.map((rule) => rule.id);
}

function quotedIds(setting: string, ids: string[]): string[] {
  return ids.filter((id) => new RegExp(`\\b${id}\\b`).test(setting));
}

describe("engineering rules scenarios", () => {
  for (const scenario of SCENARIO_LIST) {
    describe(`${scenario.skill}/${scenario.name}`, () => {
      it("exists with the four required sections", () => {
        const text = read(scenario);
        expect(text !== undefined, EXPECTED).toBe(true);

        for (const heading of HEADINGS) {
          expect(text!.includes(`\n${heading}\n`), EXPECTED).toBe(true);
        }
      });

      it("lists exactly the options A to D", () => {
        const text = read(scenario);
        expect(text !== undefined, EXPECTED).toBe(true);

        const letters = [...section(text!, "## Options").matchAll(/^- \*\*([A-Z])\.\*\*/gm)].map(
          (match) => match[1],
        );

        expect(letters, EXPECTED).toEqual(["A", "B", "C", "D"]);
      });

      it("calls any option but A a violation", () => {
        const text = read(scenario);
        expect(text !== undefined, EXPECTED).toBe(true);

        expect(/any option but A/i.test(section(text!, "## What counts as a violation")), EXPECTED).toBe(
          true,
        );
      });

      if (scenario.layer !== undefined) {
        const layer = GENERAL_SECTIONS.find((s) => s.name === scenario.layer)!;

        it(`quotes a ${layer.prefix} rule ID from the shipped files`, () => {
          const text = read(scenario);
          expect(text !== undefined, EXPECTED).toBe(true);

          const found = quotedIds(section(text!, "## Setting"), shippedIds(layer.file));

          expect(found.length > 0, EXPECTED).toBe(true);
        });
      }

      for (const name of scenario.stacks) {
        const stack = KNOWN_STACKS.find((s) => s.name === name)!;

        it(`quotes a ${stack.prefix} rule ID from the shipped files`, () => {
          const text = read(scenario);
          expect(text !== undefined, EXPECTED).toBe(true);

          const found = quotedIds(section(text!, "## Setting"), shippedIds(stack.file));

          expect(found.length > 0, EXPECTED).toBe(true);
        });
      }
    });
  }
});
