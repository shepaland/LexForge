import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import picomatch from "picomatch";
import { describe, expect, it } from "vitest";

const EXPECTED = "\nThe backend stack additions are missing\n";

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
      select: select.selectRules as Select,
    };
  } catch {
    return undefined;
  }
}

const GENERAL = ["backend.md", "frontend.md", "testing.md", "review.md"];
const STACKS = [
  { file: "node.md", yes: ["src/orders.ts", "src/orders.js"], no: ["api/orders.py", "api/orders.go"] },
  { file: "python.md", yes: ["api/orders.py"], no: ["api/orders.go"] },
  { file: "jvm.md", yes: ["Orders.java", "Orders.kt"], no: ["api/orders.py"] },
  { file: "go.md", yes: ["api/orders.go"], no: ["api/orders.py"] },
  { file: "dotnet.md", yes: ["Orders.cs"], no: ["api/orders.py"] },
  { file: "php.md", yes: ["orders.php"], no: ["api/orders.py"] },
  { file: "ruby.md", yes: ["orders.rb"], no: ["api/orders.py"] },
  { file: "rust.md", yes: ["orders.rs"], no: ["api/orders.py"] },
];

async function prefixOf(file: string): Promise<string | undefined> {
  const { KNOWN_STACKS } = await import("../../../src/core/rules/stacks.js");
  return KNOWN_STACKS.find((entry) => entry.file === file)?.prefix;
}

async function ruleOf(file: string, id: string): Promise<Rule> {
  const found = (await read(file)).find((rule) => rule.id === id);
  expect(found, `${id}\n${EXPECTED}`).toBeDefined();
  return found!;
}

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

describe("shipped backend stack additions", () => {
  it.each(STACKS)("$file holds three to five rules with the prefix from KNOWN_STACKS", async (stack) => {
    const rules = await read(stack.file);
    const prefix = await prefixOf(stack.file);
    expect(prefix, EXPECTED).toBeDefined();
    expect(rules.length, EXPECTED).toBeGreaterThanOrEqual(3);
    expect(rules.length, EXPECTED).toBeLessThanOrEqual(5);
    for (const rule of rules) {
      expect(rule.id.startsWith(`${prefix}-`), `${rule.id}\n${EXPECTED}`).toBe(true);
    }
  });

  it("repeats no ID across the eight additions and the four general files", async () => {
    const all = (await Promise.all([...STACKS.map((s) => s.file), ...GENERAL].map(read))).flat();
    expect(new Set(all.map((rule) => rule.id)).size, EXPECTED).toBe(all.length);
  });

  it("keeps every field free of Cyrillic", async () => {
    const all = (await Promise.all(STACKS.map((s) => read(s.file)))).flat();
    expect(all.length, EXPECTED).toBeGreaterThanOrEqual(24);
    for (const rule of all) {
      const text = [rule.rule, rule.sign, rule.source, ...rule.appliesTo].join("\n");
      expect(/[Ѐ-ӿ]/.test(text), `${rule.id}\n${EXPECTED}`).toBe(false);
    }
  });

  it.each(STACKS)("matches every rule of $file to its own files and not to another language", async (stack) => {
    const rules = await read(stack.file);
    expect(rules.length, EXPECTED).toBeGreaterThan(0);
    for (const rule of rules) {
      for (const file of stack.yes) expect(matches(rule, file), `${rule.id} ${file}\n${EXPECTED}`).toBe(true);
      for (const file of stack.no) expect(matches(rule, file), `${rule.id} ${file}\n${EXPECTED}`).toBe(false);
    }
  });

  it("selects BE, PY and RV rules for api/orders.py with the python stack, and no FE, TS or NODE rule", async () => {
    await read("python.md");
    const found = await modules();
    const root = mkdtempSync(path.join(tmpdir(), "lexforge-stacks-"));
    const catalog = found!.load({ root, stacks: ["python"], disabled: {} });
    const ids = found!.select(catalog, ["api/orders.py"]).map((rule) => rule.id);
    expect(ids.some((id) => id.startsWith("BE-")), EXPECTED).toBe(true);
    expect(ids.some((id) => id.startsWith("PY-")), EXPECTED).toBe(true);
    const review = await read("review.md");
    expect(review.length, EXPECTED).toBeGreaterThan(0);
    expect(ids.filter((id) => id.startsWith("RV-")).length, EXPECTED).toBe(
      review.filter((rule) => rule.id.startsWith("RV-")).length,
    );
    expect(ids.some((id) => /^(FE|TS|NODE)-/.test(id)), EXPECTED).toBe(false);
  });

  it("keeps void out of the NODE-01 Sign", async () => {
    expect((await ruleOf("node.md", "NODE-01")).sign, EXPECTED).not.toContain("void");
  });

  it("names WaitGroup in the GO-03 Sign", async () => {
    expect((await ruleOf("go.md", "GO-03")).sign, EXPECTED).toContain("WaitGroup");
  });

  it("cites the Deserialization cheat sheet for PHP-03 and drops allowed_classes", async () => {
    const rule = await ruleOf("php.md", "PHP-03");
    expect(rule.source, EXPECTED).toContain("Deserialization");
    expect(rule.rule, EXPECTED).not.toContain("allowed_classes");
  });
});
