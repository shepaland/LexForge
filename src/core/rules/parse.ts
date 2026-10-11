import { fencedLines } from "../markdown-fences.js";

export const RULE_PREFIXES = [
  "BE",
  "FE",
  "TS",
  "RV",
  "NODE",
  "PY",
  "JVM",
  "GO",
  "NET",
  "PHP",
  "RB",
  "RS",
  "REACT",
  "VUE",
  "NG",
  "SVELTE",
  "P",
] as const;
export const MAX_RULE_LENGTH = 240;
export const MAX_ID_LENGTH = 16;

export interface EngineeringRule {
  id: string;
  rule: string;
  sign: string;
  appliesTo: string[];
  source: string;
  file: string;
  line: number;
}

export interface RuleError {
  file: string;
  line: number;
  id: string;
  message: string;
}

const FIELDS = ["Rule", "Sign", "Applies to", "Source"] as const;
type Field = (typeof FIELDS)[number];

interface Draft {
  id: string;
  line: number;
  fields: Map<string, string>;
}

function globs(value: string): string[] {
  const found = [...value.matchAll(/`([^`]+)`/g)].map((match) => match[1]!.trim());
  if (found.length > 0) return found;
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

function checkId(id: string): boolean {
  const match = /^([A-Z]+)-\d{2}$/.exec(id);
  return (
    id.length <= MAX_ID_LENGTH &&
    match !== null &&
    (RULE_PREFIXES as readonly string[]).includes(match[1]!)
  );
}

function finish(draft: Draft, file: string, rules: EngineeringRule[], errors: RuleError[]): void {
  const fail = (message: string) => errors.push({ file, line: draft.line, id: draft.id, message });
  let ok = true;
  if (!checkId(draft.id)) {
    fail(
      `Rule ID ${draft.id} must match PREFIX-NN, at most ${MAX_ID_LENGTH} characters, with a prefix from ${RULE_PREFIXES.join(", ")}`,
    );
    ok = false;
  }
  for (const name of draft.fields.keys()) {
    if ((FIELDS as readonly string[]).includes(name)) continue;
    fail(`Rule ${draft.id} has a field ${name} outside Rule, Sign, Applies to and Source`);
    ok = false;
  }
  for (const name of FIELDS) {
    const value = draft.fields.get(name);
    if (value === undefined) {
      fail(`Rule ${draft.id} has no ${name} field`);
      ok = false;
    } else if (value === "") {
      fail(`Rule ${draft.id} has an empty ${name} field`);
      ok = false;
    } else if ((name === "Rule" || name === "Sign") && value.length > MAX_RULE_LENGTH) {
      fail(`Rule ${draft.id}: ${name} has ${value.length} characters, the limit is ${MAX_RULE_LENGTH}`);
      ok = false;
    }
  }
  if (!ok) return;
  const get = (name: Field) => draft.fields.get(name)!;
  rules.push({
    id: draft.id,
    rule: get("Rule"),
    sign: get("Sign"),
    appliesTo: globs(get("Applies to")),
    source: get("Source"),
    file,
    line: draft.line,
  });
}

export function parseRules(file: string, text: string): { rules: EngineeringRule[]; errors: RuleError[] } {
  const lines = text.split(/\r?\n/);
  const fenced = fencedLines(lines);
  const rules: EngineeringRule[] = [];
  const errors: RuleError[] = [];
  let draft: Draft | undefined;
  lines.forEach((line, index) => {
    if (fenced.has(index)) return;
    if (/^#{1,6}\s/.test(line)) {
      if (draft) finish(draft, file, rules, errors);
      const heading = /^###\s+(.*?)\s*$/.exec(line);
      draft = heading ? { id: heading[1]!, line: index + 1, fields: new Map() } : undefined;
      return;
    }
    const field = draft ? /^-\s+\*\*(.+?):\*\*\s*(.*?)\s*$/.exec(line) : null;
    if (draft && field) draft.fields.set(field[1]!, field[2]!);
  });
  if (draft) finish(draft, file, rules, errors);
  return { rules, errors };
}
