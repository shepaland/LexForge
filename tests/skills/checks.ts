import { answerPath } from "../../src/core/answer-path.js";
import type { SkillFile } from "../helpers/read-skills.js";

/** The frontmatter carries these two fields and nothing else. */
export const FRONTMATTER_FIELDS = ["name", "description"];

/** Descriptions of every installed skill share the system prompt; 1024 is the ceiling. */
export const MAX_DESCRIPTION_CHARS = 1024;

/** The body is loaded whole, so it competes with the conversation for attention. */
/**
 * Words a skill may spend on its own material; the shared blocks are not counted - the
 * queue rule, and the model gate that sits inside it. Both are repeated word for word
 * across the skills that carry them, so counting either would leave a skill a fraction
 * of its budget and shrink it again on every edit of the shared text.
 * 500 left no room for a rationalization the runs kept finding, and the only way to add
 * a row was to cut a rule whose scenario then went unchecked. 650 buys that room.
 */
export const MAX_BODY_WORDS = 650;

export const DESCRIPTION_OPENING = "Use when";

export interface SkillFinding {
  /** Which rule the file broke, so a test can name it without matching text. */
  rule: string;
  file: string;
  message: string;
}

function finding(rule: string, skill: SkillFile, detail: string): SkillFinding {
  const file = answerPath(skill.file);

  return { rule, file, message: `${file}: ${detail}` };
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

/** Extra fields and missing fields are the same defect: the frontmatter is not the pair. */
export function checkFrontmatterFields(skill: SkillFile): SkillFinding[] {
  const present = Object.keys(skill.frontmatter);
  const unexpected = present.filter((field) => !FRONTMATTER_FIELDS.includes(field));
  const missing = FRONTMATTER_FIELDS.filter((field) => !present.includes(field));

  if (unexpected.length === 0 && missing.length === 0) {
    return [];
  }

  const parts = [
    unexpected.length > 0 ? `unexpected ${unexpected.join(", ")}` : "",
    missing.length > 0 ? `missing ${missing.join(", ")}` : "",
  ].filter((part) => part.length > 0);

  return [
    finding(
      "frontmatter-fields",
      skill,
      `frontmatter carries exactly ${FRONTMATTER_FIELDS.join(" and ")}; ${parts.join("; ")}`,
    ),
  ];
}

export function checkNameMatchesDirectory(skill: SkillFile): SkillFinding[] {
  const name = skill.frontmatter.name;

  if (typeof name !== "string") {
    return [];
  }

  if (name === skill.dir) {
    return [];
  }

  return [
    finding("name-mismatch", skill, `name is "${name}" and the directory is "${skill.dir}"`),
  ];
}

export function checkDescriptionOpening(skill: SkillFile): SkillFinding[] {
  const description = skill.frontmatter.description;

  if (typeof description !== "string") {
    return [];
  }

  if (description.startsWith(DESCRIPTION_OPENING)) {
    return [];
  }

  return [
    finding(
      "description-opening",
      skill,
      `description starts with "${description.slice(0, 20)}" and has to start with "${DESCRIPTION_OPENING}"`,
    ),
  ];
}

export function checkDescriptionLength(skill: SkillFile): SkillFinding[] {
  const description = skill.frontmatter.description;

  if (typeof description !== "string" || description.length <= MAX_DESCRIPTION_CHARS) {
    return [];
  }

  return [
    finding(
      "description-length",
      skill,
      `description is ${description.length} characters, the limit is ${MAX_DESCRIPTION_CHARS}`,
    ),
  ];
}

export function checkBodyLength(skill: SkillFile): SkillFinding[] {
  const words = countWords(bodyWithoutQueueRule(skill.body));

  if (words <= MAX_BODY_WORDS) {
    return [];
  }

  return [
    finding("body-length", skill, `body is ${words} words, the limit is ${MAX_BODY_WORDS}`),
  ];
}

/**
 * The body without the shared block. The five planning skills repeat one queue rule, the
 * three implementation skills another, and all nine repeat the model gate inside it - so
 * what is measured here is the material a skill wrote for itself.
 */
function bodyWithoutQueueRule(body: string): string {
  const start = body.indexOf(QUEUE_RULE_START);
  const end = body.indexOf(QUEUE_RULE_END);

  if (start === -1 || end === -1 || end < start) {
    return body;
  }

  return body.slice(0, start) + body.slice(end + QUEUE_RULE_END.length);
}

/** The five planning skills: one artifact each, and a queue rule that reads that status. */
export const PLANNING_SKILLS = [
  "lexforge",
  "lexforge-propose",
  "lexforge-spec",
  "lexforge-design",
  "lexforge-plan",
];

/** The four implementation skills, in the order they run. */
export const IMPLEMENTATION_SKILLS = [
  "lexforge-apply",
  "lexforge-verify",
  "lexforge-archive",
  "lexforge-debug",
];

/**
 * The implementation skills that work on a change. They own no artifact, so their queue
 * rule asks a different question - is planning finished at all - and carries its own
 * shared block.
 */
export const QUEUE_RULE_IMPLEMENTATION_SKILLS = [
  "lexforge-apply",
  "lexforge-verify",
  "lexforge-archive",
];

/**
 * Skills whose block holds the model gate and nothing else. `lexforge-debug` fires on any
 * bug, including one in a project that has no LexForge workspace at all, so a block that
 * stops on `workspace-not-found` would forbid exactly that work; the gate itself costs it
 * nothing, because an empty assignment demands no model.
 */
export const GATE_ONLY_SKILLS = ["lexforge-debug"];

/**
 * The queue-rule markers of `lexforge-debug` fence a block that holds no queue rule, only
 * the gate. The name is kept because the markers are also what the word count skips, and
 * a test asserts the block holds nothing but the gate, so the exemption cannot grow.
 */

export const QUEUE_RULE_START = "<!-- queue-rule:start -->";
export const QUEUE_RULE_END = "<!-- queue-rule:end -->";

/** Every skill of the package, planning and implementation alike. */
export const ALL_SKILLS = [...PLANNING_SKILLS, ...IMPLEMENTATION_SKILLS];

/**
 * The model gate sits inside the queue rule of every skill, marked off on its
 * own so the nine copies can be compared without comparing the blocks around
 * them: the planning skills, the implementation skills and the debugging skill
 * carry three different queue rules and one identical gate.
 */
export const MODEL_GATE_START = "<!-- model-gate:start -->";
export const MODEL_GATE_END = "<!-- model-gate:end -->";

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
 * The shared block of a skill: everything between the two markers, or null when the
 * skill carries no block at all.
 */
export function readQueueRule(skill: SkillFile): string | null {
  const start = skill.body.indexOf(QUEUE_RULE_START);
  const end = skill.body.indexOf(QUEUE_RULE_END);

  if (start === -1 || end === -1 || end < start) {
    return null;
  }

  return skill.body.slice(start + QUEUE_RULE_START.length, end);
}

export function checkSkillStructure(skill: SkillFile): SkillFinding[] {
  return [
    ...checkFrontmatterFields(skill),
    ...checkNameMatchesDirectory(skill),
    ...checkDescriptionOpening(skill),
    ...checkDescriptionLength(skill),
    ...checkBodyLength(skill),
  ];
}
