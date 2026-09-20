import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The line count a `.ts` file under `src/` or `tests/` must not exceed. */
const LINE_LIMIT = 400;

/** The two roots this check walks. */
const WATCHED_ROOTS = ["src", "tests"];

/**
 * Directories skipped while walking a watched root. `node_modules` can in
 * principle appear anywhere a package manager decides to hoist a dependency
 * into, and this check has no reason to grade code it does not own. There is
 * no other exclusion: no `.ts` file under `src/` or `tests/` is a generated
 * artifact or a fixture deliberately kept long, so none is exempt from the
 * limit this check enforces.
 */
const SKIPPED_DIRECTORIES = new Set(["node_modules"]);

interface Finding {
  readonly file: string;
  readonly message: string;
}

/**
 * Counts newline characters the way `wc -l` does, so the number this check
 * reports is the number a developer gets from running `wc -l` on the same
 * file. A file whose last line has no terminating newline therefore counts
 * one fewer than its number of text lines — `hasTrailingNewline` below
 * reports that condition as a finding of its own instead of silently
 * folding it into the line count.
 */
const countNewlines = (text: string): number => {
  let count = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      count += 1;
    }
  }
  return count;
};

const walk = (directory: string, findings: Finding[]): void => {
  for (const entry of readdirSync(directory)) {
    if (SKIPPED_DIRECTORIES.has(entry)) {
      continue;
    }

    const entryPath = path.join(directory, entry);
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      walk(entryPath, findings);
      continue;
    }

    if (!stats.isFile() || !entry.endsWith(".ts")) {
      continue;
    }

    const text = readFileSync(entryPath, "utf8");
    const relativePath = path.relative(REPO_ROOT, entryPath);
    const lines = countNewlines(text);

    if (lines > LINE_LIMIT) {
      findings.push({
        file: relativePath,
        message: `${relativePath}: ${lines} lines (limit ${LINE_LIMIT})`,
      });
    }

    if (text.length > 0 && !text.endsWith("\n")) {
      findings.push({
        file: relativePath,
        message: `${relativePath}: missing trailing newline`,
      });
    }
  }
};

const collectFindings = (): Finding[] => {
  const findings: Finding[] = [];
  for (const root of WATCHED_ROOTS) {
    walk(path.join(REPO_ROOT, root), findings);
  }
  return findings.sort((a, b) => a.file.localeCompare(b.file));
};

describe("line-limit gate", () => {
  it("names every .ts file under src/ and tests/ that exceeds 330 lines or lacks a trailing newline", () => {
    const findings = collectFindings();
    const report = findings.map(({ message }) => `  ${message}`).join("\n");

    if (findings.length > 0) {
      expect.fail(`${findings.length} finding(s) in watched .ts files:\n${report}`);
    }
  });
});
