import { describe, expect, it } from "vitest";
import type { EngineeringRule } from "../../../src/core/rules/parse.js";

const EXPECTED = "\nThe rule selection is not implemented\n";

type Selected = { id: string; rule: string; sign: string; audience: string };
type Module = {
  selectRules: (rules: EngineeringRule[], files: string[]) => Selected[];
  MAX_SELECTED_RULES: number;
  MAX_FILES: number;
  MAX_PATH_LENGTH: number;
};

async function load(): Promise<Module | undefined> {
  try {
    return (await import("../../../src/core/rules/select.js")) as unknown as Module;
  } catch {
    return undefined;
  }
}

function rule(id: string, appliesTo: string[]): EngineeringRule {
  return { id, rule: `Rule ${id}`, sign: `Sign ${id}`, appliesTo, source: `Source ${id}`, file: "x.md", line: 1 };
}

async function select(rules: EngineeringRule[], files: string[]): Promise<Selected[]> {
  const mod = await load();
  expect(mod?.selectRules, EXPECTED).toBeTypeOf("function");
  return mod!.selectRules(rules, files);
}

describe("selectRules", () => {
  it("selects a rule when one glob matches one of the files", async () => {
    const rules = [rule("BE-02", ["**/*.py"]), rule("BE-03", ["**/*.go"])];
    expect((await select(rules, ["api/orders.py"])).map((r) => r.id), EXPECTED).toEqual(["BE-02"]);
    expect((await select(rules, ["src/cart.ts"])).map((r) => r.id), EXPECTED).toEqual([]);
    expect((await select(rules, ["src/cart.ts", "api/orders.py"])).map((r) => r.id), EXPECTED).toEqual(["BE-02"]);
  });

  it("selects a TS rule only for a test file", async () => {
    const rules = [rule("TS-01", ["**/*.test.ts"])];
    expect((await select(rules, ["src/cart.test.ts"])).map((r) => r.id), EXPECTED).toEqual(["TS-01"]);
    expect((await select(rules, ["src/cart.ts"])).map((r) => r.id), EXPECTED).toEqual([]);
  });

  it("marks RV rules reviewer and selects them for any files", async () => {
    const rules = [rule("RV-01", ["**/*.go"]), rule("BE-01", ["**/*.ts"])];
    const found = await select(rules, ["src/cart.ts"]);
    expect(found.map((r) => [r.id, r.audience]), EXPECTED).toEqual([
      ["RV-01", "reviewer"],
      ["BE-01", "both"],
    ]);
  });

  it("matches a path written with backslashes", async () => {
    const rules = [rule("BE-02", ["api/**/*.py"])];
    expect((await select(rules, ["api\\sub\\orders.py"])).map((r) => r.id), EXPECTED).toEqual(["BE-02"]);
  });

  it("holds id, rule, sign and audience only", async () => {
    const found = await select([rule("BE-02", ["**/*.py"])], ["a.py"]);
    expect(found[0] && Object.keys(found[0]).sort(), EXPECTED).toEqual(["audience", "id", "rule", "sign"]);
  });

  it("keeps the order of the catalog", async () => {
    const rules = [rule("BE-05", ["**"]), rule("BE-01", ["**"]), rule("BE-03", ["**"])];
    expect((await select(rules, ["a.ts"])).map((r) => r.id), EXPECTED).toEqual(["BE-05", "BE-01", "BE-03"]);
  });

  it("exports the limits of the contract", async () => {
    const mod = await load();
    expect(mod?.MAX_SELECTED_RULES, EXPECTED).toBe(60);
    expect(mod?.MAX_FILES, EXPECTED).toBe(200);
    expect(mod?.MAX_PATH_LENGTH, EXPECTED).toBe(1024);
  });
});
