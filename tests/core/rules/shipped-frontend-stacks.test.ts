import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import picomatch from "picomatch";
import { describe, expect, it } from "vitest";

const EXPECTED = "\nThe frontend stack additions are missing\n";

interface Rule {
  id: string;
  rule: string;
  sign: string;
  appliesTo: string[];
  source: string;
}
type Parse = (file: string, text: string) => { rules: Rule[]; errors: unknown[] };
type Load = (options: { root: string; stacks: string[]; disabled: Record<string, string> }) => Rule[];
type Select = (rules: Rule[], files: string[]) => Array<{ id: string }>;

async function modules(): Promise<{ dir: string; parse: Parse; load: Load; select: Select } | undefined> {
  try {
    const catalog = await import("../../../src/core/rules/catalog.js");
    const parse = await import("../../../src/core/rules/parse.js");
    const select = await import("../../../src/core/rules/select.js");
    return {
      dir: catalog.shippedRulesDir(),
      parse: parse.parseRules as Parse,
      load: catalog.loadCatalog as Load,
      select: select.selectRules as unknown as Select,
    };
  } catch {
    return undefined;
  }
}

const STACKS = [
  { file: "react.md", prefix: "REACT" },
  { file: "vue.md", prefix: "VUE" },
  { file: "angular.md", prefix: "NG" },
  { file: "svelte.md", prefix: "SVELTE" },
];
const GENERAL = ["backend.md", "frontend.md", "testing.md", "review.md"];

async function read(file: string): Promise<Rule[]> {
  const found = await modules();
  expect(found, EXPECTED).toBeDefined();
  const full = path.join(found!.dir, file);
  expect(existsSync(full), EXPECTED).toBe(true);
  const { rules, errors } = found!.parse(full, readFileSync(full, "utf8"));
  expect(errors, EXPECTED).toEqual([]);
  return rules;
}

function matches(rule: Rule, file: string): boolean {
  return rule.appliesTo.some((glob) => picomatch(glob, { dot: true })(file));
}

function everyRuleMatches(rules: Rule[], yes: string[], no: string[]): void {
  expect(rules.length, EXPECTED).toBeGreaterThan(0);
  for (const rule of rules) {
    for (const file of yes) expect(matches(rule, file), `${rule.id} ${file}\n${EXPECTED}`).toBe(true);
    for (const file of no) expect(matches(rule, file), `${rule.id} ${file}\n${EXPECTED}`).toBe(false);
  }
}

describe("shipped frontend stack additions", () => {
  it.each(STACKS)("$file holds three to five rules with the prefix $prefix", async (stack) => {
    const rules = await read(stack.file);
    expect(rules.length, EXPECTED).toBeGreaterThanOrEqual(3);
    expect(rules.length, EXPECTED).toBeLessThanOrEqual(5);
    for (const rule of rules) {
      expect(rule.id.startsWith(`${stack.prefix}-`), `${rule.id}\n${EXPECTED}`).toBe(true);
    }
  });

  it("uses a prefix that KNOWN_STACKS gives to each stack", async () => {
    const { KNOWN_STACKS } = await import("../../../src/core/rules/stacks.js");
    for (const stack of STACKS) {
      const known = KNOWN_STACKS.find((entry) => entry.file === stack.file);
      expect(known?.prefix, EXPECTED).toBe(stack.prefix);
    }
    const first = await read("react.md");
    expect(first.length, EXPECTED).toBeGreaterThan(0);
  });

  it("shares no ID across the four additions and the four general files", async () => {
    const general = (await Promise.all(GENERAL.map(read))).flat();
    const all = (await Promise.all([...STACKS.map((s) => s.file), ...GENERAL].map(read))).flat();
    expect(all.length, EXPECTED).toBeGreaterThan(general.length);
    expect(new Set(all.map((rule) => rule.id)).size, EXPECTED).toBe(all.length);
  });

  it("keeps every field free of Cyrillic", async () => {
    const all = (await Promise.all(STACKS.map((stack) => read(stack.file)))).flat();
    expect(all.length, EXPECTED).toBeGreaterThan(0);
    for (const rule of all) {
      const text = [rule.rule, rule.sign, rule.source, ...rule.appliesTo].join("\n");
      expect(/[Ѐ-ӿ]/.test(text), `${rule.id}\n${EXPECTED}`).toBe(false);
    }
  });

  it("matches REACT rules to tsx and jsx and not to a Vue file", async () => {
    const rules = await read("react.md");
    everyRuleMatches(rules, ["src/Cart.tsx", "src/Cart.jsx"], ["src/Cart.vue"]);
  });

  it("matches VUE rules to a Vue file", async () => {
    const rules = await read("vue.md");
    everyRuleMatches(rules, ["src/Cart.vue"], []);
  });

  it("matches NG rules to component files and not to a plain ts file", async () => {
    const rules = await read("angular.md");
    everyRuleMatches(rules, ["src/cart.component.ts"], ["src/cart.ts"]);
    for (const rule of rules.filter((r) => ["NG-01", "NG-02", "NG-03"].includes(r.id))) {
      expect(matches(rule, "src/cart.component.html"), `${rule.id}\n${EXPECTED}`).toBe(true);
    }
  });

  it("narrows the NG globs per rule", async () => {
    const rules = await read("angular.md");
    const byId = (id: string): Rule => rules.find((rule) => rule.id === id)!;
    for (const file of ["src/cart.directive.ts", "src/cart.service.ts", "src/cart.pipe.ts"]) {
      expect(matches(byId("NG-01"), file), `NG-01 ${file}\n${EXPECTED}`).toBe(true);
    }
    for (const file of ["src/cart.service.ts", "src/cart.directive.ts"]) {
      expect(matches(byId("NG-03"), file), `NG-03 ${file}\n${EXPECTED}`).toBe(false);
    }
    for (const id of ["NG-04", "NG-05"]) {
      expect(matches(byId(id), "src/cart.directive.ts"), `${id} directive\n${EXPECTED}`).toBe(true);
      for (const file of ["src/cart.service.ts", "src/cart.pipe.ts"]) {
        expect(matches(byId(id), file), `${id} ${file}\n${EXPECTED}`).toBe(false);
      }
    }
  });

  it.each(STACKS)("opens $file with a lead line naming the stack", async (stack) => {
    const found = await modules();
    expect(found, EXPECTED).toBeDefined();
    const full = path.join(found!.dir, stack.file);
    expect(existsSync(full), EXPECTED).toBe(true);
    const lines = readFileSync(full, "utf8").split("\n");
    const title = lines.findIndex((line) => line.startsWith("# "));
    const lead = lines.slice(title + 1).find((line) => line.trim() !== "") ?? "";
    expect(lead, `${stack.file}\n${EXPECTED}`).toMatch(/^Rules for [A-Za-z.]+ code\. /);
  });

  it("does not demand a declared type in the NG-04 Rule", async () => {
    const rules = await read("angular.md");
    expect(rules.find((rule) => rule.id === "NG-04")!.rule, EXPECTED).not.toContain("declared type");
  });

  it("limits the NG-04 Sign to an explicit any", async () => {
    const rules = await read("angular.md");
    expect(rules.find((rule) => rule.id === "NG-04")!.sign, EXPECTED).not.toContain("no type");
  });

  it("words the SVELTE-04 Sign as a miss of any of the attributes", async () => {
    const rules = await read("svelte.md");
    expect(rules.find((rule) => rule.id === "SVELTE-04")!.sign, EXPECTED).toContain("any of");
  });

  it("matches SVELTE rules to a Svelte file", async () => {
    const rules = await read("svelte.md");
    everyRuleMatches(rules, ["src/Cart.svelte"], []);
  });

  it("loads FE rules and no REACT rule for stacks [vue] and app.tsx", async () => {
    await read("vue.md");
    const found = await modules();
    const root = mkdtempSync(path.join(tmpdir(), "lexforge-fstack-"));
    const catalog = found!.load({ root, stacks: ["vue"], disabled: {} });
    const picked = found!.select(catalog, ["app.tsx"]).map((rule) => rule.id);
    expect(picked.some((id) => id.startsWith("FE-")), EXPECTED).toBe(true);
    expect(picked.some((id) => id.startsWith("REACT-")), EXPECTED).toBe(false);
  });
});
