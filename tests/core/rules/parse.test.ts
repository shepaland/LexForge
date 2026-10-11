import { describe, expect, it } from "vitest";

const EXPECTED = "\nThe rule parser is not implemented\n";

interface Rule {
  id: string;
  rule: string;
  sign: string;
  appliesTo: string[];
  source: string;
  file: string;
  line: number;
}
interface RuleError {
  file: string;
  line: number;
  id: string;
  message: string;
}
type Parse = (file: string, text: string) => { rules: Rule[]; errors: RuleError[] };

async function load(): Promise<Parse | undefined> {
  try {
    const mod = await import("../../../src/core/rules/parse.js");
    return mod.parseRules as Parse;
  } catch {
    return undefined;
  }
}

async function parse(text: string) {
  const parseRules = await load();
  expect(parseRules, EXPECTED).toBeTypeOf("function");
  return parseRules!("rules/backend.md", text);
}

function block(id: string, fields: Partial<Record<string, string>> = {}): string {
  const all: Record<string, string> = {
    Rule: "State the rule.",
    Sign: "A diff shows it.",
    "Applies to": "`**/*.ts`",
    Source: "-",
    ...fields,
  };
  const lines = [`### ${id}`, ""];
  for (const [name, value] of Object.entries(all)) lines.push(`- **${name}:** ${value}`);
  return lines.join("\n") + "\n";
}

describe("parseRules", () => {
  it("reads a complete rule with all four fields", async () => {
    const text = [
      "# Backend rules",
      "",
      "A paragraph before the first rule.",
      "",
      block("BE-02", {
        Rule: "Never build SQL from input.",
        Sign: "A string concatenated into a query.",
        "Applies to": "`**/*.ts`, `src/**/*.js`",
        Source: "OWASP Top 10 A03",
      }),
    ].join("\n");
    const { rules, errors } = await parse(text);
    expect(errors, EXPECTED).toEqual([]);
    expect(rules, EXPECTED).toEqual([
      {
        id: "BE-02",
        rule: "Never build SQL from input.",
        sign: "A string concatenated into a query.",
        appliesTo: ["**/*.ts", "src/**/*.js"],
        source: "OWASP Top 10 A03",
        file: "rules/backend.md",
        line: 5,
      },
    ]);
  });

  it("reports a rule without a sign with the id, the file and the heading line", async () => {
    const text = ["### P-01", "", "- **Rule:** x", "- **Applies to:** `**/*`", "- **Source:** -", ""].join("\n");
    const { errors } = await parse(text);
    expect(errors.length, EXPECTED).toBe(1);
    expect(errors[0]!.id, EXPECTED).toBe("P-01");
    expect(errors[0]!.file, EXPECTED).toBe("rules/backend.md");
    expect(errors[0]!.line, EXPECTED).toBe(1);
    expect(errors[0]!.message, EXPECTED).toContain("P-01");
    expect(errors[0]!.message, EXPECTED).toContain("Sign");
  });

  it("limits Rule and Sign to 240 characters", async () => {
    const over = await parse(block("P-02", { Rule: "a".repeat(241) }));
    expect(over.errors.length, EXPECTED).toBe(1);
    expect(over.errors[0]!.message, EXPECTED).toContain("P-02");
    expect(over.errors[0]!.message, EXPECTED).toContain("Rule");
    expect(over.errors[0]!.message, EXPECTED).toContain("240");

    const sign = await parse(block("P-02", { Sign: "a".repeat(241) }));
    expect(sign.errors.length, EXPECTED).toBe(1);
    expect(sign.errors[0]!.message, EXPECTED).toContain("P-02");
    expect(sign.errors[0]!.message, EXPECTED).toContain("Sign");
    expect(sign.errors[0]!.message, EXPECTED).toContain("240");

    const edge = await parse(block("P-02", { Rule: "a".repeat(240), Sign: "b".repeat(240) }));
    expect(edge.errors, EXPECTED).toEqual([]);
    expect(edge.rules.length, EXPECTED).toBe(1);
  });

  it("rejects an id that is not PREFIX-NN or is too long", async () => {
    for (const id of ["BE-1", "XX-01", "REACT-" + "1".repeat(11)]) {
      expect(id.length > 0, EXPECTED).toBe(true);
      const { errors } = await parse(block(id));
      expect(errors.length, EXPECTED).toBe(1);
      expect(errors[0]!.message, EXPECTED).toContain(id);
      expect(errors[0]!.message, EXPECTED).toContain("PREFIX-NN");
    }
    expect("REACT-" + "1".repeat(11), EXPECTED).toHaveLength(17);
  });

  it("accepts every prefix of the list", async () => {
    const prefixes = "BE FE TS RV NODE PY JVM GO NET PHP RB RS REACT VUE NG SVELTE P".split(" ");
    const text = prefixes.map((p) => block(`${p}-01`)).join("\n");
    const { rules, errors } = await parse(text);
    expect(errors, EXPECTED).toEqual([]);
    expect(rules.map((r) => r.id), EXPECTED).toEqual(prefixes.map((p) => `${p}-01`));
  });

  it("reports an empty Applies to, an empty Source and an unknown field", async () => {
    const applies = await parse(block("P-03", { "Applies to": "" }));
    expect(applies.errors.length, EXPECTED).toBe(1);
    expect(applies.errors[0]!.message, EXPECTED).toContain("P-03");
    expect(applies.errors[0]!.message, EXPECTED).toContain("Applies to");

    const source = await parse(block("P-03", { Source: "" }));
    expect(source.errors.length, EXPECTED).toBe(1);
    expect(source.errors[0]!.message, EXPECTED).toContain("P-03");
    expect(source.errors[0]!.message, EXPECTED).toContain("Source");

    const unknown = await parse(block("P-03", { Owner: "me" }));
    expect(unknown.errors.length, EXPECTED).toBe(1);
    expect(unknown.errors[0]!.message, EXPECTED).toContain("P-03");
    expect(unknown.errors[0]!.message, EXPECTED).toContain("Owner");

    const dash = await parse(block("P-03", { Source: "-" }));
    expect(dash.errors, EXPECTED).toEqual([]);
    expect(dash.rules[0]!.source, EXPECTED).toBe("-");
  });

  it("ignores a level-one heading, a paragraph and fenced headings", async () => {
    const text = ["# Title", "", "Intro.", "", "```", "### P-09", "```", "", block("P-04")].join("\n");
    const { rules, errors } = await parse(text);
    expect(errors, EXPECTED).toEqual([]);
    expect(rules.map((r) => r.id), EXPECTED).toEqual(["P-04"]);
  });
});
