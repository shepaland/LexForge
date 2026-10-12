import { describe, expect, it } from "vitest";

import { readSkills } from "../helpers/read-skills.js";
import { ALL_SKILLS, readQueueRule } from "./checks.js";
import { MODEL_GATE_START, VERSION_GATE_START, readVersionGate } from "./model-checks.js";
import { SKILLS } from "./helpers.js";

const EXPECTED = "\nno skill carries the marker version-gate:start\n";

describe("версионный гейт в правиле очереди", () => {
  const skills = readSkills(SKILLS).filter((skill) => ALL_SKILLS.includes(skill.dir));

  function gates(): { dir: string; text: string | null }[] {
    expect(skills.map((skill) => skill.dir).sort()).toEqual([...ALL_SKILLS].sort());

    return skills.map((skill) => ({ dir: skill.dir, text: readVersionGate(skill) }));
  }

  /** The one gate text all nine skills share; fails with the missing skills named. */
  function sharedGate(): string {
    const all = gates();
    const missing = all.filter((gate) => gate.text === null).map((gate) => gate.dir);

    expect(missing, EXPECTED).toEqual([]);

    return all[0]!.text!;
  }

  it("несут все девять скиллов внутри правила очереди, перед модельным гейтом", () => {
    sharedGate();

    for (const skill of skills) {
      const rule = readQueueRule(skill)!;

      expect(rule, `у скилла ${skill.dir} нет блока очереди`).not.toBeNull();
      expect(rule.indexOf(VERSION_GATE_START), skill.dir).toBeGreaterThan(-1);
      expect(rule.indexOf(VERSION_GATE_START), skill.dir).toBeLessThan(
        rule.indexOf(MODEL_GATE_START),
      );
    }
  });

  it("совпадает посимвольно у всех девяти", () => {
    const first = sharedGate();

    expect(
      gates()
        .filter((gate) => gate.text !== first)
        .map((gate) => gate.dir),
    ).toEqual([]);
  });

  it("при update-available показывает error.message, ждёт ответа и сам не ставит через npm install", () => {
    const text = sharedGate();
    const start = text.indexOf("update-available");
    const end = text.indexOf("skills-outdated", start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const clause = text.slice(start, end);

    expect(clause).toMatch(/\bexit `2`/i);
    expect(clause).toMatch(/show `error\.message`/);
    expect(clause).toMatch(/wait for the user's answer/);
    expect(clause).toMatch(/Never run `npm install`/);
  });

  it("при skills-outdated запускает названный в error.message lexforge init и затем отказавшую команду", () => {
    const text = sharedGate();
    const clause = text.slice(text.indexOf("skills-outdated"));
    const init = clause.indexOf("run the `lexforge init` command that `error.message` names");
    const again = clause.indexOf("run the command that refused again");

    expect(init).toBeGreaterThan(-1);
    expect(again).toBeGreaterThan(init);
  });

  it("при втором skills-outdated после ремонта показывает error.message и останавливается", () => {
    const text = sharedGate();
    const second = text.indexOf("second time");

    expect(second).toBeGreaterThan(-1);

    const tail = text.slice(second);

    expect(tail).toMatch(/show `error\.message` and stop/);
    expect(tail).not.toMatch(/lexforge init/);
  });
});
