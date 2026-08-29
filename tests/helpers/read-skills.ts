import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { parse as parseYaml } from "yaml";

export interface SkillFile {
  /** Directory name of the skill, without the path leading to it. */
  dir: string;
  /** Absolute path to SKILL.md, so a failing test can name the file. */
  file: string;
  /** Frontmatter as parsed YAML; every value is kept as it was written. */
  frontmatter: Record<string, unknown>;
  /** Everything after the closing `---`, with the leading blank line dropped. */
  body: string;
}

/**
 * Reads every `<dir>/<name>/SKILL.md`. A missing directory reads as no skills at all:
 * the checks have to run before the first skill is written.
 */
export function readSkills(dir: string): SkillFile[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => path.join(dir, name, "SKILL.md"))
    .filter((file) => existsSync(file))
    .map((file) => readSkill(file));
}

export function readSkill(file: string): SkillFile {
  const text = readFileSync(file, "utf8");
  const { frontmatter, body } = splitFrontmatter(text, file);

  return {
    dir: path.basename(path.dirname(file)),
    file,
    frontmatter,
    body,
  };
}

/**
 * The frontmatter is the block between the first two `---` lines. A file without
 * that block is a broken skill, and a broken skill stops the read: guessing where
 * the body starts would hide the defect from every check downstream.
 */
function splitFrontmatter(
  text: string,
  file: string,
): { frontmatter: Record<string, unknown>; body: string } {
  const lines = text.split("\n");

  if (lines[0]?.trim() !== "---") {
    throw new Error(`${file} does not start with a frontmatter line ---`);
  }

  const closing = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (closing === -1) {
    throw new Error(`${file} has no closing frontmatter line ---`);
  }

  const raw = (parseYaml(lines.slice(1, closing).join("\n")) ?? {}) as unknown;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${file} has a frontmatter that is not a mapping`);
  }

  return {
    frontmatter: raw as Record<string, unknown>,
    body: lines
      .slice(closing + 1)
      .join("\n")
      .replace(/^\n+/, ""),
  };
}
