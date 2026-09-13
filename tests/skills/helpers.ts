import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect } from "vitest";

import { readSkills, type SkillFile } from "../helpers/read-skills.js";
import type { SkillFinding } from "./findings.js";

export const FIXTURES = fileURLToPath(new URL("../fixtures/skills-structure", import.meta.url));
export const SKILLS = fileURLToPath(new URL("../../skills", import.meta.url));

export function fixture(dir: string): SkillFile {
  const skill = readSkills(FIXTURES).find((entry) => entry.dir === dir);
  if (!skill) {
    throw new Error(`fixture ${dir} is missing`);
  }
  return skill;
}

export function only(findings: SkillFinding[]): SkillFinding {
  expect(findings).toHaveLength(1);
  return findings[0]!;
}

export function bodyOf(dir: string): string {
  return readSkills(SKILLS).find((entry) => entry.dir === dir)!.body;
}

/** The text of one `## Heading` section, up to the next `## `. */
export function section(body: string, heading: string): string {
  const start = body.indexOf(`## ${heading}`);
  expect(start, `раздел «${heading}» не найден`).toBeGreaterThan(-1);

  const next = body.indexOf("\n## ", start + 1);
  return next === -1 ? body.slice(start) : body.slice(start, next);
}

export function parallelExecutionText(): string {
  const path = fileURLToPath(
    new URL("../../skills/lexforge-apply/parallel-execution.md", import.meta.url),
  );
  // A source line wrap must not break a phrase match: collapse whitespace runs
  // (including a mid-sentence newline) down to a single space.
  return readFileSync(path, "utf8").replace(/\s+/g, " ");
}

/** The text of one `## Heading` section, up to the next `## `. */
export function pxSection(heading: string): string {
  const text = parallelExecutionText();
  const start = text.toLowerCase().indexOf(`## ${heading}`.toLowerCase());

  expect(start, `раздел «${heading}» не найден в parallel-execution.md`).toBeGreaterThan(-1);

  const next = text.indexOf("## ", start + 3);
  return (next === -1 ? text.slice(start) : text.slice(start, next)).toLowerCase();
}

export function reviewerPromptText(): string {
  const path = fileURLToPath(
    new URL("../../skills/lexforge-apply/reviewer-prompt.md", import.meta.url),
  );
  return readFileSync(path, "utf8");
}

/**
 * The text of one `## Heading` section, up to the next `## `. Whitespace
 * runs (including a mid-sentence line wrap) collapse to a single space so
 * a source line wrap cannot break a phrase match.
 */
export function rpSection(heading: string): string {
  const text = reviewerPromptText().replace(/\s+/g, " ");
  const start = text.toLowerCase().indexOf(`## ${heading}`.toLowerCase());

  expect(start, `раздел «${heading}» не найден в reviewer-prompt.md`).toBeGreaterThan(-1);

  const next = text.indexOf("## ", start + 3);
  return (next === -1 ? text.slice(start) : text.slice(start, next)).toLowerCase();
}

export function planSkillText(): string {
  const path = fileURLToPath(new URL("../../skills/lexforge-plan/SKILL.md", import.meta.url));
  return readFileSync(path, "utf8").replace(/\s+/g, " ");
}

/** The next `## Heading` from `from`, skipping a `### ` or deeper heading found by the same bare search. */
export function nextTopHeading(text: string, from: number): number {
  let idx = from;
  for (;;) {
    idx = text.indexOf("## ", idx);
    if (idx === -1 || text[idx - 1] !== "#") {
      return idx;
    }
    idx += 1;
  }
}

export function planSection(heading: string): string {
  const text = planSkillText();
  const start = text.toLowerCase().indexOf(`## ${heading}`.toLowerCase());

  expect(start, `раздел «${heading}» не найден в lexforge-plan/SKILL.md`).toBeGreaterThan(-1);

  const next = nextTopHeading(text, start + 3);
  return next === -1 ? text.slice(start) : text.slice(start, next);
}
