import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const EXPECTED = "\nThe rules command is not implemented\n";

const CHANGE_FILES = { "lexforge/changes/demo/.lexforge.yaml": "schema: spec-driven\n" };

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

function workspace(config: string, extra: Record<string, string> = {}): string {
  const root = makeWorkspace({
    "lexforge/config.yaml": config,
    ...CHANGE_FILES,
    ...extra,
  });
  created.push(root);
  return root;
}

async function rules(root: string, argv: string[]) {
  const capture = createCapture();
  const exitCode = await run(["rules", ...argv], {
    cwd: root,
    stdout: capture.stdout,
    stderr: capture.stderr,
  });
  return { exitCode, out: capture.out, err: capture.err };
}

interface Selection {
  outputVersion?: number;
  change?: string;
  rules?: Array<Record<string, unknown>>;
  nextStep?: string;
  error?: { code: string; message: string };
}

async function json(root: string, argv: string[]) {
  const result = await rules(root, [...argv, "--json"]);
  let document: Selection = {};
  try {
    document = JSON.parse(result.out) as Selection;
  } catch {
    document = {};
  }
  return { ...result, document };
}

const PYTHON = "engineering:\n  stacks: [python]\n";
const NODE_REACT = "engineering:\n  stacks: [node, react]\n";

function ids(document: Selection): string[] {
  return (document.rules ?? []).map((entry) => String(entry.id));
}

function repoRules(file: string): string {
  return readFileSync(new URL(`../../rules/${file}`, import.meta.url), "utf8");
}

function projectRules(count: number): string {
  const lines = ["# Team rules", ""];
  for (let n = 1; n <= count; n += 1) {
    lines.push(
      `### P-${String(n).padStart(2, "0")}`,
      "",
      "- **Rule:** Keep it small.",
      "- **Sign:** A large diff.",
      "- **Applies to:** `**/*`",
      "- **Source:** Team",
      "",
    );
  }
  return lines.join("\n");
}

describe("lexforge rules", () => {
  it("selects the BE, PY and RV rules for a Python file", async () => {
    const root = workspace(PYTHON);
    const { exitCode, document } = await json(root, [
      "--change",
      "demo",
      "--files",
      "api/orders.py",
    ]);

    expect(exitCode, EXPECTED).toBe(0);
    expect(document.outputVersion, EXPECTED).toBe(1);
    expect(document.change, EXPECTED).toBe("demo");
    expect(typeof document.nextStep, EXPECTED).toBe("string");
    const found = ids(document);
    expect(found.some((id) => id.startsWith("BE-")), EXPECTED).toBe(true);
    expect(found.some((id) => id.startsWith("PY-")), EXPECTED).toBe(true);
    expect(found.some((id) => id.startsWith("RV-")), EXPECTED).toBe(true);
    const reviewIds = [...repoRules("review.md").matchAll(/^### (RV-\d+)\s*$/gm)].map((m) => m[1]!);
    expect(reviewIds.length, EXPECTED).toBeGreaterThan(0);
    for (const id of reviewIds) {
      expect(found, EXPECTED).toContain(id);
    }
    expect(found.some((id) => id.startsWith("FE-") || id.startsWith("TS-")), EXPECTED).toBe(false);
  });

  it("gives each entry the five contract keys and the audience", async () => {
    const root = workspace(PYTHON);
    const { document } = await json(root, ["--change", "demo", "--files", "api/orders.py"]);

    expect((document.rules ?? []).length, EXPECTED).toBeGreaterThan(0);
    for (const entry of document.rules ?? []) {
      expect(Object.keys(entry).sort(), EXPECTED).toEqual(["audience", "id", "rule", "sign"]);
      expect(entry.audience, EXPECTED).toBe(String(entry.id).startsWith("RV-") ? "reviewer" : "both");
    }
  });

  it("adds the TS rules when a test file joins the set", async () => {
    const root = workspace(NODE_REACT);
    const plain = await json(root, ["--change", "demo", "--files", "src/cart.ts"]);
    const withTest = await json(root, [
      "--change",
      "demo",
      "--files",
      "src/cart.ts",
      "src/cart.test.ts",
    ]);

    expect(plain.exitCode, EXPECTED).toBe(0);
    expect(ids(plain.document).some((id) => id.startsWith("TS-")), EXPECTED).toBe(false);
    expect(ids(withTest.document).some((id) => id.startsWith("TS-")), EXPECTED).toBe(true);
  });

  it("prints a line with the ID, rule and sign and no Source in human output", async () => {
    const root = workspace(PYTHON);
    const { exitCode, out, document } = await json(root, [
      "--change",
      "demo",
      "--files",
      "api/orders.py",
    ]);
    const be02 = (document.rules ?? []).find((entry) => entry.id === "BE-02");
    const human = await rules(root, ["--change", "demo", "--files", "api/orders.py"]);
    const line = human.out.split("\n").find((text) => text.includes("BE-02"));

    expect(exitCode, EXPECTED).toBe(0);
    expect(out.length, EXPECTED).toBeGreaterThan(0);
    expect(be02, EXPECTED).toBeDefined();
    expect(human.exitCode, EXPECTED).toBe(0);
    expect(line, EXPECTED).toContain(String(be02?.rule));
    expect(line, EXPECTED).toContain(String(be02?.sign));
    expect(line, EXPECTED).not.toMatch(/Source|Applies to/);
    const block = repoRules("backend.md").split(/^### /m).find((part) => part.startsWith("BE-02"));
    const source = /^- \*\*Source:\*\* (.+)$/m.exec(block ?? "")?.[1]?.trim();
    expect(source, EXPECTED).toBeTruthy();
    expect(line, EXPECTED).not.toContain(source!);
  });

  it("exits 2 with change-not-found for a change that does not exist", async () => {
    const root = workspace(PYTHON);
    const { exitCode, document } = await json(root, ["--change", "ghost", "--files", "a.py"]);

    expect(exitCode, EXPECTED).toBe(2);
    expect(document.error?.code, EXPECTED).toBe("change-not-found");
  });

  it("exits 1 with files-too-many for 201 paths and accepts 200 of one name", async () => {
    const root = workspace(PYTHON);
    const many = Array.from({ length: 201 }, (_, n) => `api/file${n}.py`);
    const refused = await json(root, ["--change", "demo", "--files", ...many]);
    const same = await json(root, ["--change", "demo", "--files", ...Array(200).fill("api/orders.py")]);

    expect(refused.exitCode, EXPECTED).toBe(1);
    expect(refused.document.error?.code, EXPECTED).toBe("files-too-many");
    expect(refused.document.error?.message, EXPECTED).toContain("201");
    expect(same.exitCode, EXPECTED).toBe(0);
  });

  it("keeps a Node and React set within 60 rules", async () => {
    const root = workspace(NODE_REACT);
    const { exitCode, document } = await json(root, [
      "--change",
      "demo",
      "--files",
      "src/orders.ts",
      "src/Cart.tsx",
      "src/cart.test.ts",
    ]);

    expect(exitCode, EXPECTED).toBe(0);
    expect((document.rules ?? []).length, EXPECTED).toBeGreaterThan(0);
    expect((document.rules ?? []).length, EXPECTED).toBeLessThanOrEqual(60);
  });

  it("exits 2 with path-too-long for a path of 1025 characters", async () => {
    const root = workspace(PYTHON);
    const { exitCode, document } = await json(root, [
      "--change",
      "demo",
      "--files",
      `${"a".repeat(1022)}.py`,
    ]);

    expect(exitCode, EXPECTED).toBe(2);
    expect(document.error?.code, EXPECTED).toBe("path-too-long");
  });

  it("exits 0 for a path of exactly 1024 characters", async () => {
    const root = workspace(PYTHON);
    const { exitCode } = await json(root, ["--change", "demo", "--files", `${"a".repeat(1021)}.py`]);

    expect(exitCode, EXPECTED).toBe(0);
  });

  it("exits 2 with path-too-long for an empty path", async () => {
    const root = workspace(PYTHON);
    const { exitCode, document } = await json(root, ["--change", "demo", "--files", ""]);

    expect(exitCode, EXPECTED).toBe(2);
    expect(document.error?.code, EXPECTED).toBe("path-too-long");
  });

  it("exits 1 with rules-too-many and names the exact count when project rules push it past 60", async () => {
    const files = ["--change", "demo", "--files", "api/orders.py"];
    const baseline = await json(workspace(PYTHON), files);
    const root = workspace(PYTHON, { "lexforge/rules/team.md": projectRules(61) });
    const { exitCode, document } = await json(root, files);
    const expected = (baseline.document.rules ?? []).length + 61;

    expect(baseline.exitCode, EXPECTED).toBe(0);
    expect(exitCode, EXPECTED).toBe(1);
    expect(document.error?.code, EXPECTED).toBe("rules-too-many");
    expect(document.error?.message, EXPECTED).toContain(`${expected} rules match`);
    expect(document.error?.message, EXPECTED).toContain("Split the cycle");
  });

  it("drops a switched-off rule from the output", async () => {
    const root = workspace(`${PYTHON}  disabled:\n    BE-02: "not used here"\n`);
    const { exitCode, document } = await json(root, ["--change", "demo", "--files", "api/orders.py"]);

    expect(exitCode, EXPECTED).toBe(0);
    expect(ids(document), EXPECTED).toContain("BE-01");
    expect(ids(document), EXPECTED).not.toContain("BE-02");
  });
});
