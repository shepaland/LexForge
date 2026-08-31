import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ALL_SKILLS } from "./checks.js";

const SCENARIOS = fileURLToPath(new URL("../scenarios", import.meta.url));

/**
 * The sections a scenario carries. The first two are handed to the subagent
 * whole; the last two are for whoever runs the scenario and reads its answer.
 */
const REQUIRED_HEADINGS = [
  "## Setting",
  "## Options",
  "## Pressures",
  "## What counts as a violation",
];

/** A scenario of the model gate is named for it, so the set is readable at a glance. */
const GATE_SCENARIO = /^model-gate.*\.md$/;

function scenarioFiles(skill: string): string[] {
  const dir = path.join(SCENARIOS, skill);

  return existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".md")).sort() : [];
}

describe("сценарии давления на модельный гейт", () => {
  it("есть у каждого из девяти скиллов", () => {
    const missing = ALL_SKILLS.filter(
      (skill) => !scenarioFiles(skill).some((name) => GATE_SCENARIO.test(name)),
    );

    expect(missing).toEqual([]);
  });
});

describe("состав файла сценария", () => {
  it("каждый сценарий несёт четыре раздела", () => {
    const findings: string[] = [];

    for (const skill of ALL_SKILLS) {
      for (const name of scenarioFiles(skill)) {
        const text = readFileSync(path.join(SCENARIOS, skill, name), "utf8");

        for (const heading of REQUIRED_HEADINGS) {
          if (!text.includes(`\n${heading}\n`)) {
            findings.push(`${skill}/${name}: нет раздела «${heading}»`);
          }
        }
      }
    }

    expect(findings).toEqual([]);
  });

  it("сценарий гейта называет назначенную модель и передачу субагенту", () => {
    const findings: string[] = [];

    for (const skill of ALL_SKILLS) {
      for (const name of scenarioFiles(skill).filter((file) => GATE_SCENARIO.test(file))) {
        const text = readFileSync(path.join(SCENARIOS, skill, name), "utf8");

        if (!text.includes("subagent")) {
          findings.push(`${skill}/${name}: не называет передачу субагенту`);
        }
        if (!/model/i.test(text)) {
          findings.push(`${skill}/${name}: не называет модель`);
        }
      }
    }

    expect(findings).toEqual([]);
  });
});
