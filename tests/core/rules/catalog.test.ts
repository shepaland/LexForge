import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { makeWorkspace } from "../../helpers/workspace.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const EXPECTED = "\nThe rule catalog is not implemented\n";

interface Rule {
  id: string;
  rule: string;
  file: string;
}
type Load = (options: {
  root: string;
  shippedDir?: string;
  stacks: string[] | null;
  disabled: Record<string, string>;
}) => Rule[];
interface Stack {
  name: string;
  prefix: string;
  file: string;
}

async function loadModule(): Promise<{ loadCatalog?: Load; stacks?: Stack[] } | undefined> {
  try {
    const catalog = await import("../../../src/core/rules/catalog.js");
    const stacks = await import("../../../src/core/rules/stacks.js");
    return { loadCatalog: catalog.loadCatalog as Load, stacks: stacks.KNOWN_STACKS as Stack[] };
  } catch {
    return undefined;
  }
}

async function catalog(
  project: Record<string, string>,
  stacks: string[] | null,
  disabled: Record<string, string> = {},
  shipped: Record<string, string> = SHIPPED,
): Promise<Rule[]> {
  const mod = await loadModule();
  expect(mod?.loadCatalog, EXPECTED).toBeTypeOf("function");
  const root = makeWorkspace(project);
  const shippedDir = makeWorkspace(shipped);
  return mod!.loadCatalog!({ root, shippedDir, stacks, disabled });
}

function block(id: string, rule = "State the rule."): string {
  return [
    `### ${id}`,
    "",
    `- **Rule:** ${rule}`,
    "- **Sign:** A diff shows it.",
    "- **Applies to:** `**/*.ts`",
    "- **Source:** -",
    "",
  ].join("\n");
}

function file(...blocks: string[]): string {
  return ["# Rules", "", ...blocks].join("\n");
}

const SHIPPED: Record<string, string> = {
  "backend.md": file(block("BE-01"), block("BE-05", "Shipped rule.")),
  "frontend.md": file(block("FE-14")),
  "testing.md": file(block("TS-01")),
  "review.md": file(block("RV-01")),
  "python.md": file(block("PY-01")),
  "react.md": file(block("REACT-01")),
};

const ids = (rules: Rule[]) => rules.map((rule) => rule.id);

describe("loadCatalog", () => {
  it("names the twelve stacks with their prefixes and files", async () => {
    const mod = await loadModule();
    expect(mod?.stacks, EXPECTED).toEqual([
      { name: "node", prefix: "NODE", file: "node.md" },
      { name: "python", prefix: "PY", file: "python.md" },
      { name: "jvm", prefix: "JVM", file: "jvm.md" },
      { name: "go", prefix: "GO", file: "go.md" },
      { name: "dotnet", prefix: "NET", file: "dotnet.md" },
      { name: "php", prefix: "PHP", file: "php.md" },
      { name: "ruby", prefix: "RB", file: "ruby.md" },
      { name: "rust", prefix: "RS", file: "rust.md" },
      { name: "react", prefix: "REACT", file: "react.md" },
      { name: "vue", prefix: "VUE", file: "vue.md" },
      { name: "angular", prefix: "NG", file: "angular.md" },
      { name: "svelte", prefix: "SVELTE", file: "svelte.md" },
    ]);
  });

  it("loads the four general files only for an empty stack list", async () => {
    const rules = await catalog({}, []);
    expect(ids(rules), EXPECTED).toEqual(["BE-01", "BE-05", "FE-14", "TS-01", "RV-01"]);
  });

  it("adds the rules of a named stack and no other stack", async () => {
    const rules = await catalog({}, ["python"]);
    expect(ids(rules), EXPECTED).toEqual(["BE-01", "BE-05", "FE-14", "TS-01", "RV-01", "PY-01"]);
  });

  it("loads the general files only when the stacks are missing", async () => {
    const rules = await catalog({}, null);
    expect(ids(rules), EXPECTED).toEqual(["BE-01", "BE-05", "FE-14", "TS-01", "RV-01"]);
  });

  it("replaces a shipped rule by a project rule with the same ID in place", async () => {
    const rules = await catalog({ "lexforge/rules/backend.md": file(block("BE-05", "Project rule.")) }, []);
    expect(ids(rules), EXPECTED).toEqual(["BE-01", "BE-05", "FE-14", "TS-01", "RV-01"]);
    const replaced = rules.find((rule) => rule.id === "BE-05");
    expect(replaced?.rule, EXPECTED).toBe("Project rule.");
    expect(replaced?.file, EXPECTED).toContain("lexforge");
  });

  it("adds a new project rule after the shipped rules", async () => {
    const rules = await catalog({ "lexforge/rules/team.md": file(block("P-01")) }, []);
    expect(ids(rules), EXPECTED).toEqual(["BE-01", "BE-05", "FE-14", "TS-01", "RV-01", "P-01"]);
  });

  it("drops a disabled rule", async () => {
    const rules = await catalog({}, [], { "FE-14": "the product has one language" });
    expect(ids(rules), EXPECTED).toEqual(["BE-01", "BE-05", "TS-01", "RV-01"]);
  });

  it("throws rules-invalid naming the file, the line and the rule", async () => {
    const broken = file("### BE-09", "", "- **Rule:** Only a rule.", "");
    const mod = await loadModule();
    expect(mod?.loadCatalog, EXPECTED).toBeTypeOf("function");
    const root = makeWorkspace({});
    const shippedDir = makeWorkspace({ ...SHIPPED, "backend.md": broken });
    let thrown: { code?: string; message?: string } | undefined;
    try {
      mod!.loadCatalog!({ root, shippedDir, stacks: [], disabled: {} });
    } catch (error) {
      thrown = error as { code?: string; message?: string };
    }
    expect(thrown?.code, EXPECTED).toBe("rules-invalid");
    expect(thrown?.message, EXPECTED).toContain("backend.md");
    expect(thrown?.message, EXPECTED).toContain("BE-09");
    expect(thrown?.message, EXPECTED).toContain("backend.md:3");
  });

  it("throws rules-invalid for a broken project file", async () => {
    const mod = await loadModule();
    expect(mod?.loadCatalog, EXPECTED).toBeTypeOf("function");
    const root = makeWorkspace({ "lexforge/rules/team.md": file("### P-02", "", "- **Rule:** Only a rule.", "") });
    const shippedDir = makeWorkspace(SHIPPED);
    let code: string | undefined;
    try {
      mod!.loadCatalog!({ root, shippedDir, stacks: [], disabled: {} });
    } catch (error) {
      code = (error as { code?: string }).code;
    }
    expect(code, EXPECTED).toBe("rules-invalid");
  });

  it("reads the rules directory of the package when no shipped directory is given", async () => {
    const mod = await loadModule();
    expect(mod?.loadCatalog, EXPECTED).toBeTypeOf("function");
    const catalogModule = (await import("../../../src/core/rules/catalog.js")) as { shippedRulesDir: () => string };
    expect(catalogModule.shippedRulesDir(), EXPECTED).toBe(path.resolve(REPO_ROOT, "rules"));
  });

  async function thrownBy(shipped: Record<string, string>, stacks: string[]) {
    const mod = await loadModule();
    expect(mod?.loadCatalog, EXPECTED).toBeTypeOf("function");
    const root = makeWorkspace({});
    const shippedDir = makeWorkspace(shipped);
    try {
      mod!.loadCatalog!({ root, shippedDir, stacks, disabled: {} });
    } catch (error) {
      return error as { code?: string; message?: string };
    }
    return undefined;
  }

  it("throws rules-invalid naming a general file the package lacks", async () => {
    const { "testing.md": _gone, ...rest } = SHIPPED;
    const thrown = await thrownBy(rest, []);
    expect(thrown?.code, EXPECTED).toBe("rules-invalid");
    expect(thrown?.message, EXPECTED).toContain("testing.md");
  });

  it("throws rules-invalid naming the file of a named stack the package lacks", async () => {
    const { "python.md": _gone, ...rest } = SHIPPED;
    const thrown = await thrownBy(rest, ["python"]);
    expect(thrown?.code, EXPECTED).toBe("rules-invalid");
    expect(thrown?.message, EXPECTED).toContain("python.md");
  });
});
