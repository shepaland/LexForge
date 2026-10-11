import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isMap, isPair, isScalar, isSeq, LineCounter, parseDocument, type Node } from "yaml";

import { parseRules, type EngineeringRule } from "../rules/parse.js";
import { GENERAL_SECTIONS, KNOWN_STACKS } from "../rules/stacks.js";
import { type Finding, makeFinding } from "./finding.js";

const MAX_REASON_LENGTH = 200;
const CONFIG_FILE = "lexforge/config.yaml";
const RULES_DIR = "lexforge/rules";

function shippedIds(shippedDir: string): Set<string> {
  const ids = new Set<string>();
  for (const section of [...GENERAL_SECTIONS, ...KNOWN_STACKS]) {
    const file = path.join(shippedDir, section.file);
    if (!existsSync(file)) continue;
    for (const rule of parseRules(file, readFileSync(file, "utf8")).rules) ids.add(rule.id);
  }
  return ids;
}

function checkProjectRules(root: string, shipped: Set<string>, findings: Finding[]): void {
  const dir = path.join(root, RULES_DIR);
  if (!existsSync(dir)) return;
  const seen = new Map<string, EngineeringRule>();
  for (const name of readdirSync(dir).filter((entry) => entry.endsWith(".md")).sort()) {
    const shown = `${RULES_DIR}/${name}`;
    const { rules, errors } = parseRules(shown, readFileSync(path.join(dir, name), "utf8"));
    for (const error of errors) {
      findings.push(makeFinding(shown, error.line, "engineering-rule-format", error.message));
    }
    for (const rule of rules) {
      const first = seen.get(rule.id);
      if (first) {
        findings.push(
          makeFinding(
            shown,
            rule.line,
            "engineering-rule-duplicate",
            `Rule ${rule.id} is defined in ${first.file} and in ${shown}: keep it in one file.`,
          ),
        );
      } else {
        seen.set(rule.id, rule);
      }
      if (!rule.id.startsWith("P-") && !shipped.has(rule.id)) {
        findings.push(
          makeFinding(shown, rule.line, "engineering-rule-unknown", `Rule ${rule.id} matches no shipped rule: rename it to a P- ID or fix the ID.`),
        );
      }
    }
  }
}

function checkConfig(root: string, shipped: Set<string>, findings: Finding[]): void {
  const file = path.join(root, CONFIG_FILE);
  if (!existsSync(file)) return;
  const lines = new LineCounter();
  const doc = parseDocument(readFileSync(file, "utf8"), { lineCounter: lines });
  const lineOf = (node: Node | null | undefined): number => lines.linePos(node?.range?.[0] ?? 0).line;
  const section = doc.get("engineering", true);
  if (!isMap(section)) return;

  const disabled = section.get("disabled", true);
  if (isMap(disabled)) {
    for (const entry of disabled.items) {
      if (!isPair(entry) || !isScalar(entry.key)) continue;
      const id = String(entry.key.value);
      const line = lineOf(entry.key);
      const reason = isScalar(entry.value) ? String(entry.value.value ?? "") : "";
      if (reason.trim() === "" || reason.length > MAX_REASON_LENGTH) {
        findings.push(
          makeFinding(CONFIG_FILE, line, "engineering-disabled-reason", `The disabled rule ${id} needs a reason of 1 to ${MAX_REASON_LENGTH} characters.`),
        );
      }
      if (!shipped.has(id)) {
        findings.push(makeFinding(CONFIG_FILE, line, "engineering-rule-unknown", `The disabled entry ${id} matches no shipped rule.`));
      }
    }
  }

  const stacks = section.get("stacks", true);
  const known = KNOWN_STACKS.map((stack) => stack.name);
  if (isSeq(stacks)) {
    const keyLine = lineOf(section.items.find((item) => isScalar(item.key) && item.key.value === "stacks")?.key as Node);
    for (const item of stacks.items) {
      const name = String(isScalar(item) ? item.value : item);
      if (!known.includes(name)) {
        findings.push(
          makeFinding(CONFIG_FILE, keyLine, "engineering-stack-unknown", `The stack ${name} is not known: use one of ${known.join(", ")}.`),
        );
      }
    }
  }
}

/** Checks the project rule files and the `engineering` section of config.yaml against the shipped rules. */
export function checkEngineeringRules(root: string, shippedDir: string): Finding[] {
  const findings: Finding[] = [];
  const shipped = shippedIds(shippedDir);
  checkProjectRules(root, shipped, findings);
  checkConfig(root, shipped, findings);
  return findings;
}
