import { describe, expect, it } from "vitest";

const MISSING = "\nThe interaction check is not implemented\n";
const HEADER = "| Message | From | To | Field | Type | Required | Length | Response | Errors |";
const SEP = "|---|---|---|---|---|---|---|---|---|";

type Check = (file: string, text: string) => Array<{ file: string; line: number; rule: string; message: string }>;

async function load(): Promise<Check | undefined> {
  try {
    const mod = await import("../../../src/core/validation/interaction-contract.js");
    return mod.checkInteractions as Check;
  } catch {
    return undefined;
  }
}

async function run(text: string) {
  const check = await load();
  expect(check, MISSING).toBeTypeOf("function");
  return check!("spec.md", text);
}

function spec(lines: string[]): string {
  return ["## ADDED Requirements", "", "### Requirement: Login", "", ...lines, ""].join("\n");
}

const DIAGRAM = ["```sequence", "web -> ingest: login", "```", ""];

function table(rows: string[], header = HEADER): string[] {
  return [header, SEP, ...rows];
}

const OK_ROW = "| login | web | ingest | email | string | yes | 1..255 | ok | 400 |";

describe("checkInteractions", () => {
  it("reports a missing diagram at the Interaction line", async () => {
    const found = await run(spec(["Interaction: web -> ingest"]));
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("interaction-diagram-missing");
    expect(found[0].line).toBe(5);
    expect(found[0].message).toContain("Login");
  });

  it("names a participant absent from the diagram", async () => {
    const found = await run(
      spec(["Interaction: web -> ingest, ingest -> store", "", ...DIAGRAM, ...table([OK_ROW])]),
    );
    const hit = found.filter((f) => f.rule === "interaction-participant-missing");
    expect(hit).toHaveLength(1);
    expect(hit[0].message).toContain("store");
  });

  it("asks nothing of a requirement without the marker", async () => {
    expect(await run(spec(["The system SHALL log in."]))).toEqual([]);
  });

  it("reports a missing table", async () => {
    const found = await run(spec(["Interaction: web -> ingest", "", ...DIAGRAM]));
    expect(found.map((f) => f.rule)).toEqual(["contract-table-missing"]);
  });

  it("reports wrong columns", async () => {
    const bad = "| Message | From | To | Field | Type | Length | Required | Response | Errors |";
    const found = await run(spec(["Interaction: web -> ingest", "", ...DIAGRAM, ...table([OK_ROW], bad)]));
    expect(found.map((f) => f.rule)).toContain("contract-columns");
  });

  it("reports a string with an empty length", async () => {
    const row = "| login | web | ingest | email | string | yes |  | ok | 400 |";
    const found = await run(spec(["Interaction: web -> ingest", "", ...DIAGRAM, ...table([row])]));
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("contract-length-missing");
    expect(found[0].message).toContain("login");
    expect(found[0].message).toContain("email");
    expect(found[0].line).toBe(13);
  });

  it("reports a length on a boolean", async () => {
    const row = "| login | web | ingest | remember | boolean | no | 1..5 | ok | 400 |";
    const found = await run(spec(["Interaction: web -> ingest", "", ...DIAGRAM, ...table([row])]));
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("contract-length-forbidden");
    expect(found[0].message).toContain("has no length");
  });

  it("reports a length of the wrong form", async () => {
    const row = "| login | web | ingest | email | string | yes | long | ok | 400 |";
    const found = await run(spec(["Interaction: web -> ingest", "", ...DIAGRAM, ...table([row])]));
    expect(found.map((f) => f.rule)).toEqual(["contract-length-form"]);
  });

  it("accepts a range, an upper bound and a complete table", async () => {
    const rows = [OK_ROW, "| login | web | ingest | tags | array | no | <=100 | ok | 400 |"];
    const found = await run(spec(["Interaction: web -> ingest", "", ...DIAGRAM, ...table(rows)]));
    expect(found).toEqual([]);
  });

  it("reports an arrow without a row", async () => {
    const diagram = ["```sequence", "web -> ingest: login", "ingest -> store: save", "```", ""];
    const found = await run(spec(["Interaction: web -> ingest, ingest -> store", "", ...diagram, ...table([OK_ROW])]));
    expect(found.map((f) => f.rule)).toEqual(["contract-arrow-without-row"]);
    expect(found[0].message).toContain("save");
  });

  it("reports a row without an arrow, also when From and To differ", async () => {
    const rows = [OK_ROW, "| logout | web | ingest |  | none | no |  | ok | 401 |"];
    const found = await run(spec(["Interaction: web -> ingest", "", ...DIAGRAM, ...table(rows)]));
    const hit = found.filter((f) => f.rule === "contract-row-without-arrow");
    expect(hit).toHaveLength(1);
    expect(hit[0].message).toContain("logout");

    const swapped = "| login | ingest | web | email | string | yes | 1..255 | ok | 400 |";
    const other = await run(spec(["Interaction: web -> ingest", "", ...DIAGRAM, ...table([swapped])]));
    expect(other.map((f) => f.rule)).toContain("contract-row-without-arrow");
  });

  it("F1: reports an arrow without a message name on its own line", async () => {
    const diagram = ["```sequence", "web -> ingest", "```", ""];
    const found = await run(spec(["Interaction: web -> ingest", "", ...diagram, ...table([OK_ROW])]));
    const hit = found.filter((f) => f.rule === "interaction-arrow-unlabelled");
    expect(hit).toHaveLength(1);
    expect(hit[0].line).toBe(8);
    expect(hit[0].message).toContain("a -> b: message");
    expect(found.filter((f) => f.rule === "interaction-participant-missing")).toEqual([]);
  });

  it("F2: matches arrows to rows by message and by From and To", async () => {
    const diagram = ["```sequence", "web -> ingest: login", "ingest -> store: login", "```", ""];
    const found = await run(spec(["Interaction: web -> ingest, ingest -> store", "", ...diagram, ...table([OK_ROW])]));
    const hit = found.filter((f) => f.rule === "contract-arrow-without-row");
    expect(hit).toHaveLength(1);
    expect(hit[0].message).toContain("ingest");
    expect(hit[0].message).toContain("store");
  });

  it("F3: puts the arrow without a row on the line of the arrow", async () => {
    const diagram = ["```sequence", "web -> ingest: login", "ingest -> store: save", "```", ""];
    const found = await run(spec(["Interaction: web -> ingest, ingest -> store", "", ...diagram, ...table([OK_ROW])]));
    expect(found.map((f) => f.line)).toEqual([9]);
  });

  it("F4: does not assume a separator row", async () => {
    const noSep = [HEADER, "| login | web | ingest | email | string | yes |  | ok | 400 |"];
    const found = await run(spec(["Interaction: web -> ingest", "", ...DIAGRAM, ...noSep]));
    expect(found.map((f) => f.rule)).toEqual(["contract-length-missing"]);
  });

  it("F5: counts a participant named anywhere in the diagram as shown", async () => {
    const diagram = ["```sequence", "web    ingest    store", "web -> ingest: login", "```", ""];
    const found = await run(spec(["Interaction: web -> ingest, ingest -> store", "", ...diagram, ...table([OK_ROW])]));
    expect(found.filter((f) => f.rule === "interaction-participant-missing")).toEqual([]);
  });

  it("F6: compares the type without regard to case", async () => {
    const row = "| login | web | ingest | email | String | yes |  | ok | 400 |";
    const found = await run(spec(["Interaction: web -> ingest", "", ...DIAGRAM, ...table([row])]));
    expect(found.map((f) => f.rule)).toEqual(["contract-length-missing"]);
  });

  it("F7: counts the names of an unspaced arrow as shown", async () => {
    const diagram = ["```sequence", "web->ingest:login", "```", ""];
    const found = await run(spec(["Interaction: web -> ingest", "", ...diagram, ...table([OK_ROW])]));
    expect(found).toEqual([]);
  });

  it("F8: reports a line that looks like an arrow in another form", async () => {
    for (const bad of ["web --login--> ingest", "ingest --> web"]) {
      const diagram = ["```sequence", "web -> ingest: login", bad, "```", ""];
      const found = await run(spec(["Interaction: web -> ingest", "", ...diagram, ...table([OK_ROW])]));
      const hit = found.filter((f) => f.rule === "interaction-arrow-unlabelled");
      expect(hit).toHaveLength(1);
      expect(hit[0].line).toBe(9);
      expect(hit[0].message).toContain("a -> b: message");
    }
  });
});
