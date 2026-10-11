import { afterEach, describe, expect, it } from "vitest";

import { shippedRulesDir } from "../../../src/core/rules/catalog.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const EXPECTED = "\nThe engineering settings check is not implemented\n";

interface Found {
  file: string;
  line: number;
  rule: string;
  message: string;
}
type Check = (root: string, shippedDir: string) => Found[];

async function load(): Promise<Check | undefined> {
  try {
    const mod = await import("../../../src/core/validation/engineering-rules.js");
    return mod.checkEngineeringRules as Check;
  } catch {
    return undefined;
  }
}

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

async function run(files: Record<string, string>): Promise<Found[]> {
  const check = await load();
  expect(check, EXPECTED).toBeTypeOf("function");
  const root = makeWorkspace(files);
  created.push(root);
  return check!(root, shippedRulesDir());
}

function rule(id: string, sign = "Do the other thing."): string {
  const signLine = sign === "" ? [] : [`- **Sign:** ${sign}`];
  return [`### ${id}`, "", "- **Rule:** Keep it small.", ...signLine, "- **Applies to:** `**/*.ts`", "- **Source:** LexForge", ""].join("\n");
}

function config(engineering: string[]): Record<string, string> {
  return { "lexforge/config.yaml": ["schema: spec-driven", "engineering:", ...engineering, ""].join("\n") };
}

describe("checkEngineeringRules on project rule files", () => {
  it("reports a rule without a Sign with the file and the heading line", async () => {
    const found = await run({ "lexforge/rules/team.md": `# Team\n\n${rule("P-01", "")}` });
    const hit = found.find((item) => item.rule === "engineering-rule-format");
    expect(hit, EXPECTED).toBeDefined();
    expect(hit!.file, EXPECTED).toBe("lexforge/rules/team.md");
    expect(hit!.line, EXPECTED).toBe(3);
  });

  it("reports an ID held by two files naming the ID and both files", async () => {
    const found = await run({
      "lexforge/rules/a.md": rule("P-01"),
      "lexforge/rules/b.md": rule("P-01"),
    });
    const hit = found.find((item) => item.rule === "engineering-rule-duplicate");
    expect(hit, EXPECTED).toBeDefined();
    expect(hit!.message, EXPECTED).toContain("P-01");
    expect(hit!.message, EXPECTED).toContain("lexforge/rules/a.md");
    expect(hit!.message, EXPECTED).toContain("lexforge/rules/b.md");
  });

  it("reports a rule matching no shipped rule, and not an override or a P rule", async () => {
    const found = await run({ "lexforge/rules/backend.md": rule("BE-99") });
    const hit = found.find((item) => item.rule === "engineering-rule-unknown");
    expect(hit, EXPECTED).toBeDefined();
    expect(hit!.message, EXPECTED).toContain("BE-99");
    expect(hit!.message, EXPECTED).toContain("matches no shipped rule");

    const override = await run({ "lexforge/rules/backend.md": rule("BE-05") });
    expect(override, EXPECTED).toEqual([]);
    const own = await run({ "lexforge/rules/backend.md": rule("P-07") });
    expect(own, EXPECTED).toEqual([]);
  });
});

describe("checkEngineeringRules on the engineering section", () => {
  it("reports a disabled rule with an empty reason and the line of the entry", async () => {
    const found = await run(config(["  disabled:", '    BE-05: ""']));
    const hit = found.find((item) => item.rule === "engineering-disabled-reason");
    expect(hit, EXPECTED).toBeDefined();
    expect(hit!.message, EXPECTED).toContain("BE-05");
    expect(hit!.file, EXPECTED).toBe("lexforge/config.yaml");
    expect(hit!.line, EXPECTED).toBe(4);
  });

  it("accepts a reason of 200 characters and rejects one of 201", async () => {
    const long = await run(config(["  disabled:", `    BE-05: "${"x".repeat(201)}"`]));
    expect(long.map((item) => item.rule), EXPECTED).toContain("engineering-disabled-reason");
    const edge = await run(config(["  disabled:", `    BE-05: "${"x".repeat(200)}"`]));
    expect(edge, EXPECTED).toEqual([]);
  });

  it("reports a disabled entry that matches no shipped rule with its line", async () => {
    const found = await run(config(["  disabled:", '    XX-01: "legacy"']));
    const hit = found.find((item) => item.rule === "engineering-rule-unknown");
    expect(hit, EXPECTED).toBeDefined();
    expect(hit!.message, EXPECTED).toContain("XX-01");
    expect(hit!.file, EXPECTED).toBe("lexforge/config.yaml");
    expect(hit!.line, EXPECTED).toBe(4);
  });

  it("reports an unknown stack naming it and the twelve known stacks", async () => {
    const found = await run(config(["  stacks: [python, elixir]"]));
    const hit = found.find((item) => item.rule === "engineering-stack-unknown");
    expect(hit, EXPECTED).toBeDefined();
    expect(hit!.message, EXPECTED).toContain("elixir");
    for (const name of ["node", "python", "jvm", "go", "dotnet", "php", "ruby", "rust", "react", "vue", "angular", "svelte"]) {
      expect(hit!.message, EXPECTED).toContain(name);
    }
    expect(hit!.file, EXPECTED).toBe("lexforge/config.yaml");
    expect(hit!.line, EXPECTED).toBe(3);
  });
});

describe("checkEngineeringRules on clean workspaces", () => {
  it("gives no finding without an engineering key and without rule files", async () => {
    const found = await run({ "lexforge/config.yaml": "schema: spec-driven\n" });
    expect(found, EXPECTED).toEqual([]);
  });

  it("gives no finding for clean settings", async () => {
    const found = await run({
      ...config(["  stacks: [python, node]", "  disabled:", '    BE-05: "generated code"']),
      "lexforge/rules/team.md": rule("P-01"),
    });
    expect(found, EXPECTED).toEqual([]);
  });
});
