import { SHIPPED_PROVIDERS } from "../../src/core/models/catalogue.js";
import type { SkillFile } from "../helpers/read-skills.js";
import { finding, type SkillFinding } from "./findings.js";

/**
 * The model gate sits inside the queue rule of every skill, marked off on its
 * own so the nine copies can be compared without comparing the blocks around
 * them: the planning skills, the implementation skills and the debugging skill
 * carry three different queue rules and one identical gate.
 */
export const MODEL_GATE_START = "<!-- model-gate:start -->";
export const MODEL_GATE_END = "<!-- model-gate:end -->";

/**
 * The model block a skill opens with: the model it runs on, one line per
 * provider of the shipped catalogue. It is read only where the project names
 * no model of its own, and it stands ahead of the queue rule, so an agent has
 * its model before it has anything else.
 */
export const MODEL_BLOCK_START = "<!-- model-block:start -->";
export const MODEL_BLOCK_END = "<!-- model-block:end -->";

/** The model block of one skill, or null when the skill carries none. */
export function readModelBlock(skill: SkillFile): string | null {
  const start = skill.body.indexOf(MODEL_BLOCK_START);
  const end = skill.body.indexOf(MODEL_BLOCK_END);

  if (start === -1 || end === -1 || end < start) {
    return null;
  }

  return skill.body.slice(start + MODEL_BLOCK_START.length, end);
}

/** Provider to model, as one skill's model block names them. */
export function modelBlockEntries(skill: SkillFile): Record<string, string> {
  const block = readModelBlock(skill);
  if (block === null) {
    return {};
  }

  const entries: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const row = /^\|\s*([^|\s]+)\s*\|\s*([^|]+?)\s*\|$/.exec(line.trim());
    if (row && row[1] !== "Provider" && !row[1]!.startsWith("-")) {
      entries[row[1]!] = row[2]!;
    }
  }

  return entries;
}

/** The gate of one skill, or null when the skill carries none. */
export function readModelGate(skill: SkillFile): string | null {
  const start = skill.body.indexOf(MODEL_GATE_START);
  const end = skill.body.indexOf(MODEL_GATE_END);

  if (start === -1 || end === -1 || end < start) {
    return null;
  }

  return skill.body.slice(start + MODEL_GATE_START.length, end);
}

/**
 * Every model a block names has to be a model the shipped catalogue holds for
 * that provider. The blocks are read by agents that cannot check a name, so a
 * provider release that renames a model shows up on a run here instead.
 */
export function checkModelBlockCatalogue(skill: SkillFile): SkillFinding[] {
  return Object.entries(modelBlockEntries(skill)).flatMap(([provider, model]) => {
    const models = SHIPPED_PROVIDERS[provider];

    if (!models) {
      return [
        finding(
          "model-block-catalogue",
          skill,
          `model block names the provider ${provider}, which the shipped catalogue does not hold`,
        ),
      ];
    }

    return models.includes(model)
      ? []
      : [
          finding(
            "model-block-catalogue",
            skill,
            `model block names ${model} for ${provider}, ` +
              `and the shipped catalogue holds ${models.join(", ")}`,
          ),
        ];
  });
}
