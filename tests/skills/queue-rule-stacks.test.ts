import { describe, expect, it } from "vitest";

import { readSkills } from "../helpers/read-skills.js";
import { PLANNING_SKILLS, QUEUE_RULE_IMPLEMENTATION_SKILLS, readQueueRule } from "./checks.js";
import { SKILLS } from "./helpers.js";

const STACKS = [
  "node",
  "python",
  "jvm",
  "go",
  "dotnet",
  "php",
  "ruby",
  "rust",
  "react",
  "vue",
  "angular",
  "svelte",
];

const MARKER = "\nThe queue rule does not ask for the stacks\n";

describe("правило очереди просит назвать стеки", () => {
  const skills = readSkills(SKILLS);

  function blocksOf(group: string[]): { dir: string; text: string }[] {
    return group.map((dir) => {
      const skill = skills.find((entry) => entry.dir === dir);

      expect(skill, `нет скилла ${dir}`).toBeDefined();
      return { dir, text: (readQueueRule(skill!) ?? "").replace(/\s+/g, " ") };
    });
  }

  describe.each([
    ["планирования", PLANNING_SKILLS],
    ["реализации", QUEUE_RULE_IMPLEMENTATION_SKILLS],
  ])("скиллы %s", (_name, group) => {
    it("блок читает отсутствие стеков и в статусе, и в коде ошибки", () => {
      for (const block of blocksOf(group)) {
        expect(block.text.includes('engineeringStacks: "missing"'), `${MARKER}${block.dir}`).toBe(true);
        expect(block.text.includes("engineering-stacks-missing"), `${MARKER}${block.dir}`).toBe(true);
      }
    });

    it("блок называет все двенадцать стеков", () => {
      for (const block of blocksOf(group)) {
        for (const stack of STACKS) {
          expect(new RegExp(`\\b${stack}\\b`).test(block.text), `${MARKER}${block.dir}: ${stack}`).toBe(true);
        }
      }
    });

    it("блок велит спросить пользователя, дождаться ответа и сохранить обе формы команды", () => {
      for (const block of blocksOf(group)) {
        const text = block.text.toLowerCase();

        expect(text.includes("ask the user which"), `${MARKER}${block.dir}`).toBe(true);
        expect(text.includes("wait for the answer"), `${MARKER}${block.dir}`).toBe(true);
        expect(text.includes("lexforge stacks set <stack>..."), `${MARKER}${block.dir}`).toBe(true);
        expect(text.includes("lexforge stacks set --none"), `${MARKER}${block.dir}`).toBe(true);
      }
    });

    it("блок запрещает выбирать стеки самому и писать их в config.yaml руками", () => {
      for (const block of blocksOf(group)) {
        const text = block.text.toLowerCase();

        expect(text.includes("never choose the stacks yourself"), `${MARKER}${block.dir}`).toBe(true);
        expect(
          text.includes("never write them into `lexforge/config.yaml` by hand"),
          `${MARKER}${block.dir}`,
        ).toBe(true);
      }
    });

    it("блок разрешает --none только по ответу пользователя и не признаёт отменяемую догадку", () => {
      for (const block of blocksOf(group)) {
        const text = block.text.toLowerCase();

        expect(
          text.includes(
            "run `lexforge stacks set --none` only when the user says the project uses none of them",
          ),
          `${MARKER}${block.dir}: none`,
        ).toBe(true);
        expect(
          text.includes("a guess the user can undo later is still a guess"),
          `${MARKER}${block.dir}: guess`,
        ).toBe(true);
      }
    });

    it("блок закрывает три отговорки: файлы, «не спрашивай про настройку», «пусть будет не задано»", () => {
      for (const block of blocksOf(group)) {
        const text = block.text.toLowerCase();

        expect(text.includes("even when the files show"), `${MARKER}${block.dir}: files`).toBe(true);
        expect(text.includes("not to ask about setup"), `${MARKER}${block.dir}: setup`).toBe(true);
        expect(text.includes("unset is not an answer"), `${MARKER}${block.dir}: unset`).toBe(true);
      }
    });

    it("текст про стеки стоит перед строкой про exit 2", () => {
      for (const block of blocksOf(group)) {
        const stacks = block.text.indexOf("engineering-stacks-missing");
        const exit = block.text.indexOf("Exit `2`");

        expect(exit, `${block.dir}: нет строки про exit 2`).toBeGreaterThan(-1);
        expect(stacks > -1 && stacks < exit, `${MARKER}${block.dir}`).toBe(true);
      }
    });
  });
});
