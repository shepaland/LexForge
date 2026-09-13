import { describe, expect, it } from "vitest";

import { readSkills } from "../helpers/read-skills.js";
import {
  GATE_ONLY_SKILLS,
  IMPLEMENTATION_SKILLS,
  PLANNING_SKILLS,
  QUEUE_RULE_IMPLEMENTATION_SKILLS,
  readQueueRule,
} from "./checks.js";
import { MODEL_GATE_END, MODEL_GATE_START, readModelGate } from "./model-checks.js";
import { SKILLS } from "./helpers.js";

describe("общий блок правила очереди", () => {
  function blocksOf(group: string[], dir = SKILLS): { dir: string; text: string | null }[] {
    const skills = readSkills(dir).filter((skill) => group.includes(skill.dir));
    const missing = group.filter((name) => !skills.some((skill) => skill.dir === name));

    expect(missing).toEqual([]);

    return skills.map((skill) => ({ dir: skill.dir, text: readQueueRule(skill) }));
  }

  function sharedText(group: string[], dir = SKILLS): string {
    const blocks = blocksOf(group, dir);

    expect(blocks.filter((block) => block.text === null).map((block) => block.dir)).toEqual([]);
    expect(blocks).toHaveLength(group.length);

    const first = blocks[0]!;
    // The list names the file: a skill left with the old text shows up by its directory.
    expect(blocks.filter((block) => block.text !== first.text).map((block) => block.dir)).toEqual(
      [],
    );

    return first.text!;
  }

  it("совпадает посимвольно у пяти скиллов планирования", () => {
    expect(sharedText(PLANNING_SKILLS)).toContain("Queue rule");
  });

  it("совпадает посимвольно у трёх скиллов реализации, работающих на change", () => {
    expect(sharedText(QUEUE_RULE_IMPLEMENTATION_SKILLS)).toContain("Queue rule");
  });

  it("у двух групп разный: планирование читает артефакт, реализация — весь план", () => {
    expect(sharedText(QUEUE_RULE_IMPLEMENTATION_SKILLS)).not.toBe(sharedText(PLANNING_SKILLS));
  });

  it("блок скилла отладки — это один модельный гейт: он работает и без рабочего пространства", () => {
    const skills = readSkills(SKILLS).filter((skill) => GATE_ONLY_SKILLS.includes(skill.dir));

    expect(skills).toHaveLength(GATE_ONLY_SKILLS.length);
    for (const skill of skills) {
      const block = readQueueRule(skill);
      const gate = readModelGate(skill);

      expect(block, `у скилла ${skill.dir} нет блока`).not.toBeNull();
      expect(gate, `у скилла ${skill.dir} нет гейта`).not.toBeNull();
      const withMarkers = `${MODEL_GATE_START}${gate!}${MODEL_GATE_END}`;

      expect(block!.replace(withMarkers, "").trim()).toBe("");
      expect(block).not.toContain("workspace-not-found");
    }
  });

  it("блок отладки не совпадает ни с планирующим, ни с реализующим", () => {
    const debugBlock = blocksOf(GATE_ONLY_SKILLS)[0]!.text;

    expect(debugBlock).not.toBe(sharedText(PLANNING_SKILLS));
    expect(debugBlock).not.toBe(sharedText(QUEUE_RULE_IMPLEMENTATION_SKILLS));
  });

  it("группы блока и каталог скиллов сходятся", () => {
    expect([...QUEUE_RULE_IMPLEMENTATION_SKILLS, ...GATE_ONLY_SKILLS].sort()).toEqual(
      IMPLEMENTATION_SKILLS.slice().sort(),
    );
  });

  /** Words that turn "the skill does it" back into "the skill offers, then waits". */
  const STALLING_WORDS = ["offer", "ask", "approve", "permission", "stop"];

  it("блок планирования чинит отсутствие рабочего пространства через init, не спрашивая и не останавливаясь", () => {
    const block = sharedText(PLANNING_SKILLS);
    const start = block.indexOf("workspace-not-found");
    const end = block.indexOf("change-not-found", start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const clause = block.slice(start, end).toLowerCase();

    expect(clause).toContain("--tools");
    for (const word of STALLING_WORDS) {
      expect(clause, `«${word}» в предложении про workspace-not-found`).not.toMatch(
        new RegExp(`\\b${word}\\b`),
      );
    }
  });

  it("блок реализации чинит отсутствие рабочего пространства через init, не спрашивая и не останавливаясь", () => {
    const block = sharedText(QUEUE_RULE_IMPLEMENTATION_SKILLS);
    const start = block.indexOf("workspace-not-found");
    const end = block.indexOf("change-not-found", start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const clause = block.slice(start, end).toLowerCase();

    expect(clause).toContain("--tools");
    for (const word of STALLING_WORDS) {
      expect(clause, `«${word}» в предложении про workspace-not-found`).not.toMatch(
        new RegExp(`\\b${word}\\b`),
      );
    }
  });

  it("после артефакта блок планирования выполняет nextStep сам и останавливается только на isPlanningComplete", () => {
    const block = sharedText(PLANNING_SKILLS);
    const index = block.indexOf("isPlanningComplete");

    expect(index).toBeGreaterThan(-1);

    const before = block.slice(Math.max(0, index - 400), index);
    const after = block.slice(index, index + 300);
    const handoff = (before + after).toLowerCase();

    // The command named in nextStep is run by the skill itself, not merely named for later.
    expect(before).toContain("nextStep");
    expect(before).toMatch(/\brun\b/i);
    for (const phrase of ["let the user", "tell the user"]) {
      expect(handoff, `«${phrase}» в передаче хода`).not.toContain(phrase);
    }

    // The stop is tied to isPlanningComplete being true, not to finishing one artifact.
    expect(after).toMatch(/`true`/);
    expect(before + after).toMatch(/\bstop\b/i);
  });

  /** Words that turn "run it yourself" back into "name it and wait for the user". */
  const HANDOFF_STALLING_WORDS = [
    "wait",
    "further",
    "answer",
    "permission",
    "stop",
    "tell the user",
    "let the user",
  ];

  it.each(["lexforge", "lexforge-propose", "lexforge-spec", "lexforge-design"])(
    "%s запускает свой nextStep сам, без слов ожидания рядом с ним",
    (dir) => {
      const skill = readSkills(SKILLS).find((entry) => entry.dir === dir)!;
      const index = skill.body.lastIndexOf("nextStep");

      expect(index).toBeGreaterThan(-1);

      const window = skill.body.slice(Math.max(0, index - 80), index + 40).toLowerCase();

      expect(window).toMatch(/\brun\b/);
      for (const word of HANDOFF_STALLING_WORDS) {
        expect(window, `«${word}» рядом с nextStep у ${dir}`).not.toContain(word);
      }
    },
  );

  it("общий блок планирования не отменяет вопрос, которого требует сам артефакт", () => {
    const block = sharedText(PLANNING_SKILLS);
    const carveOutIndex = block.toLowerCase().indexOf("handover between artifacts");

    expect(
      carveOutIndex,
      "блок не отличает вопрос артефакта от передачи хода между артефактами",
    ).toBeGreaterThan(-1);

    const before = block.slice(Math.max(0, carveOutIndex - 220), carveOutIndex).toLowerCase();

    expect(before).toMatch(/\bask/);
    expect(before).toMatch(/\bwait/);
  });

  it("блок реализации после init повторяет именно отказавшую команду, а не «carry on»", () => {
    const block = sharedText(QUEUE_RULE_IMPLEMENTATION_SKILLS).toLowerCase();
    const start = block.indexOf("workspace-not-found");
    const end = block.indexOf("change-not-found", start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const clause = block.slice(start, end);

    expect(clause).toMatch(/refused/);
    expect(clause).not.toMatch(/\bcarry on\b/);
  });
});

