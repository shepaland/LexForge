import picomatch from "picomatch";
import type { EngineeringRule } from "./parse.js";

export const MAX_SELECTED_RULES = 60;
export const MAX_FILES = 200;
export const MAX_PATH_LENGTH = 1024;

export interface SelectedRule {
  id: string;
  rule: string;
  sign: string;
  audience: "reviewer" | "both";
}

/**
 * Picks the rules whose `Applies to` globs match at least one of the files,
 * in catalog order. RV rules are picked for any files and go to the reviewer.
 */
export function selectRules(rules: EngineeringRule[], files: string[]): SelectedRule[] {
  const paths = files.map((file) => file.replace(/\\/g, "/"));
  const selected: SelectedRule[] = [];
  for (const rule of rules) {
    const review = rule.id.startsWith("RV-");
    const matches =
      review ||
      rule.appliesTo.some((glob) => {
        const isMatch = picomatch(glob, { dot: true });
        return paths.some((path) => isMatch(path));
      });
    if (!matches) continue;
    selected.push({
      id: rule.id,
      rule: rule.rule,
      sign: rule.sign,
      audience: review ? "reviewer" : "both",
    });
  }
  return selected;
}
