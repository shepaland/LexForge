import { answerPath } from "../../src/core/answer-path.js";
import type { SkillFile } from "../helpers/read-skills.js";

export interface SkillFinding {
  /** Which rule the file broke, so a test can name it without matching text. */
  rule: string;
  file: string;
  message: string;
}

export function finding(rule: string, skill: SkillFile, detail: string): SkillFinding {
  const file = answerPath(skill.file);

  return { rule, file, message: `${file}: ${detail}` };
}
