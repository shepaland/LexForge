import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { UsageError } from "../../cli/errors.js";
import { parseRules, type EngineeringRule } from "./parse.js";
import { GENERAL_SECTIONS, KNOWN_STACKS } from "./stacks.js";

export interface CatalogOptions {
  root: string;
  shippedDir?: string;
  stacks: string[] | null;
  disabled: Record<string, string>;
}

/** `rules/` sits next to `src/` and `dist/`, three levels above this module. */
export function shippedRulesDir(): string {
  return fileURLToPath(new URL("../../../rules", import.meta.url));
}

function readRuleFile(file: string): EngineeringRule[] {
  const { rules, errors } = parseRules(file, readFileSync(file, "utf8"));
  const first = errors[0];
  if (first) {
    throw new UsageError(
      "rules-invalid",
      `${first.file}:${first.line} rule ${first.id}: ${first.message}`,
      "Fix the rule in that file and run the command again.",
      first.file,
    );
  }
  return rules;
}

function projectFiles(root: string): string[] {
  const dir = path.join(root, "lexforge", "rules");
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => path.join(dir, name));
}

export function loadCatalog(options: CatalogOptions): EngineeringRule[] {
  const shippedDir = options.shippedDir ?? shippedRulesDir();
  const named = new Set(options.stacks ?? []);
  const shippedNames = [
    ...GENERAL_SECTIONS.map((section) => section.file),
    ...KNOWN_STACKS.filter((stack) => named.has(stack.name)).map((stack) => stack.file),
  ];
  const catalog: EngineeringRule[] = [];

  const add = (rule: EngineeringRule): void => {
    const at = catalog.findIndex((existing) => existing.id === rule.id);
    if (at >= 0) {
      catalog[at] = rule;
    } else {
      catalog.push(rule);
    }
  };

  for (const name of shippedNames) {
    const file = path.join(shippedDir, name);
    if (!existsSync(file)) {
      throw new UsageError(
        "rules-invalid",
        `The shipped rule file ${file} is missing.`,
        "Reinstall LexForge so that its rules directory is complete.",
        file,
      );
    }
    readRuleFile(file).forEach(add);
  }
  for (const file of projectFiles(options.root)) {
    readRuleFile(file).forEach(add);
  }

  return catalog.filter((rule) => !Object.hasOwn(options.disabled, rule.id));
}
