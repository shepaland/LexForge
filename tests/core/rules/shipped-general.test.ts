import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import picomatch from "picomatch";
import { describe, expect, it } from "vitest";

const EXPECTED = "\nThe general rule sections are missing\n";

interface Rule {
  id: string;
  rule: string;
  sign: string;
  appliesTo: string[];
  source: string;
}
type Parse = (file: string, text: string) => { rules: Rule[]; errors: unknown[] };
type Load = (options: { root: string; stacks: string[]; disabled: Record<string, string> }) => Rule[];

async function modules(): Promise<{ dir: string; parse: Parse; load: Load } | undefined> {
  try {
    const catalog = await import("../../../src/core/rules/catalog.js");
    const parse = await import("../../../src/core/rules/parse.js");
    return { dir: catalog.shippedRulesDir(), parse: parse.parseRules as Parse, load: catalog.loadCatalog as Load };
  } catch {
    return undefined;
  }
}

const SECTIONS = [
  { file: "backend.md", prefix: "BE", count: 13 },
  { file: "frontend.md", prefix: "FE", count: 14 },
  { file: "testing.md", prefix: "TS", count: 11 },
  { file: "review.md", prefix: "RV", count: 11 },
];

async function read(file: string): Promise<Rule[]> {
  const found = await modules();
  expect(found, EXPECTED).toBeDefined();
  const full = path.join(found!.dir, file);
  expect(existsSync(full), EXPECTED).toBe(true);
  const { rules, errors } = found!.parse(full, readFileSync(full, "utf8"));
  expect(errors, EXPECTED).toEqual([]);
  return rules;
}

function ids(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-${String(i + 1).padStart(2, "0")}`);
}

function matches(rule: Rule, file: string): boolean {
  return rule.appliesTo.some((glob) => picomatch(glob, { dot: true })(file));
}

describe("shipped general rule sections", () => {
  it.each(SECTIONS)("$file holds $prefix-01 to its last rule and only its own prefix", async (section) => {
    const rules = await read(section.file);
    expect(
      rules.map((rule) => rule.id),
      EXPECTED,
    ).toEqual(ids(section.prefix, section.count));
  });

  it("shares no ID across the four files", async () => {
    const all = (await Promise.all(SECTIONS.map((section) => read(section.file)))).flat();
    expect(new Set(all.map((rule) => rule.id)).size, EXPECTED).toBe(49);
  });

  it("gives every rule a Source and keeps every field free of Cyrillic", async () => {
    const all = (await Promise.all(SECTIONS.map((section) => read(section.file)))).flat();
    expect(all.length, EXPECTED).toBe(49);
    for (const rule of all) {
      expect(rule.source.trim(), EXPECTED).not.toBe("");
      expect(rule.source.trim() === "-" || rule.source.trim() !== "LexForge", `${rule.id} source\n${EXPECTED}`).toBe(true);
      expect(["none", "-"], `${rule.id} sign\n${EXPECTED}`).not.toContain(rule.sign.trim().replace(/\.$/, "").toLowerCase());
      const text = [rule.rule, rule.sign, rule.source, ...rule.appliesTo].join("\n");
      expect(/[Ѐ-ӿ]/.test(text), EXPECTED).toBe(false);
    }
  });

  it("pins the owner-chosen signs of RV-04 and RV-08", async () => {
    const rules = await read("review.md");
    const sign = (id: string) => rules.find((rule) => rule.id === id)?.sign.trim();
    expect(sign("RV-04"), EXPECTED).toBe(
      "A report that puts findings on naming or style above findings on correctness or security.",
    );
    expect(sign("RV-08"), EXPECTED).toBe("A repeat review report that does not give the status of each earlier finding.");
  });

  it("matches every BE rule to backend files and not to a Vue file", async () => {
    const rules = await read("backend.md");
    expect(rules.length, EXPECTED).toBe(13);
    for (const rule of rules) {
      expect(matches(rule, "api/orders.py"), EXPECTED).toBe(true);
      expect(matches(rule, "src/orders.ts"), EXPECTED).toBe(true);
      expect(matches(rule, "src/Cart.vue"), EXPECTED).toBe(false);
    }
  });

  it("matches every FE rule to component files and not to a Python file", async () => {
    const rules = await read("frontend.md");
    expect(rules.length, EXPECTED).toBe(14);
    for (const rule of rules) {
      expect(matches(rule, "src/Cart.tsx"), EXPECTED).toBe(true);
      expect(matches(rule, "src/Cart.vue"), EXPECTED).toBe(true);
      expect(matches(rule, "api/orders.py"), EXPECTED).toBe(false);
    }
  });

  it("matches every TS rule to test files and not to a source file", async () => {
    const rules = await read("testing.md");
    expect(rules.length, EXPECTED).toBe(11);
    for (const rule of rules) {
      expect(matches(rule, "src/cart.test.ts"), EXPECTED).toBe(true);
      expect(matches(rule, "tests/test_orders.py"), EXPECTED).toBe(true);
      expect(matches(rule, "src/cart.ts"), EXPECTED).toBe(false);
    }
  });

  it("applies every RV rule to the glob for all files", async () => {
    const rules = await read("review.md");
    expect(rules.length, EXPECTED).toBe(11);
    for (const rule of rules) {
      expect(rule.appliesTo, EXPECTED).toEqual(["**/*"]);
    }
  });

  it("returns the 49 rules for no stacks over a project with no rule files", async () => {
    await read("backend.md");
    const found = await modules();
    const root = mkdtempSync(path.join(tmpdir(), "lexforge-shipped-"));
    const catalog = found!.load({ root, stacks: [], disabled: {} });
    expect(catalog.length, EXPECTED).toBe(49);
  });
});
