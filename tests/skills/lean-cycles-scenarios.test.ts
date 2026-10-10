import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SCENARIOS = fileURLToPath(new URL("../scenarios", import.meta.url));

/** The seven pressure scenarios of the lean cycles change, by skill. */
const LEAN_SCENARIOS: Array<[skill: string, name: string]> = [
  ["lexforge-apply", "re-review-the-whole-wave.md"],
  ["lexforge-apply", "whole-plan-in-the-brief.md"],
  ["lexforge-apply", "poll-the-executor.md"],
  ["lexforge-spec", "class-without-asking.md"],
  ["lexforge-spec", "css-path-unknown.md"],
  ["lexforge-spec", "interaction-without-diagram.md"],
  ["lexforge-archive", "merge-dev-into-main.md"],
];

const HEADINGS = ["## Setting", "## Options", "## Pressures", "## What counts as a violation"];

function read(skill: string, name: string): string | null {
  const file = path.join(SCENARIOS, skill, name);

  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

/** The body of one `## ` section, up to the next one. */
function section(text: string, heading: string): string {
  const start = text.indexOf(`\n${heading}\n`);

  if (start === -1) {
    return "";
  }
  const rest = text.slice(start + heading.length + 2);
  const next = rest.search(/\n## /);

  return next === -1 ? rest : rest.slice(0, next);
}

describe("lean cycles pressure scenarios", () => {
  it("all seven files exist", () => {
    const missing = LEAN_SCENARIOS.filter(([skill, name]) => read(skill, name) === null).map(
      ([skill, name]) => `${skill}/${name}`,
    );

    expect(missing, "\nThe lean cycles scenarios are missing\n").toEqual([]);
  });

  it("each carries the four sections, options A to D and the violation rule", () => {
    const findings: string[] = [];

    for (const [skill, name] of LEAN_SCENARIOS) {
      const text = read(skill, name);

      if (text === null) {
        findings.push(`${skill}/${name}: missing`);
        continue;
      }
      for (const heading of HEADINGS) {
        if (!text.includes(`\n${heading}\n`)) {
          findings.push(`${skill}/${name}: no section "${heading}"`);
        }
      }
      const letters = [...section(text, "## Options").matchAll(/^- \*\*([A-Z])\.\*\*/gm)].map(
        (match) => match[1],
      );

      if (letters.join("") !== "ABCD") {
        findings.push(`${skill}/${name}: options are "${letters.join("")}", not ABCD`);
      }
      if (!/any option but A/i.test(section(text, "## What counts as a violation"))) {
        findings.push(`${skill}/${name}: violation section does not say any option but A`);
      }
    }

    expect(findings).toEqual([]);
  });
});
