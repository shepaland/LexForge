import { expect, it } from "vitest";
import { commitAll, writeAt } from "../helpers/git-workspace.js";
import { call, cycle, dir, fixture } from "../helpers/execution-workspace.js";

const EXPECTED = "\nContext does not carry the engineering rules\n";

function plan(root: string, source: string, test: string) {
  const files = [source, test];
  writeAt(
    root,
    `${dir}/tasks.md`,
    `## 1. Greeting\n\nDepends on: none\n\n- [ ] 1.1 [A] Write \`${test}\`. Check: \`node tests/check.cjs\`\n  -> greet#Hello\n- [ ] 1.2 [A] Implement \`${source}\`. Check: \`node tests/check.cjs\`\n  -> greet#Hello\n`,
  );
  writeAt(
    root,
    `${dir}/execution-plan.json`,
    JSON.stringify({
      version: 1,
      cycles: [
        {
          ...cycle,
          files: files.map((path) => ({ path, symbols: [] })),
          testFiles: [test],
        },
      ],
    }),
  );
}

function pythonProject(root: string, extra = "") {
  writeAt(
    root,
    "lexforge/config.yaml",
    `schema: spec-driven\nverification:\n  tests: node tests/check.cjs\nengineering:\n  stacks: [python]\n${extra}`,
  );
  plan(root, "api/orders.py", "tests/check.cjs");
  commitAll(root, "python project");
}

async function rules(root: string): Promise<any[]> {
  const r = await call(root, ["context", "--task", "1.2"]);
  expect(r.exitCode).toBe(0);
  expect(Array.isArray(r.data.engineering_rules), EXPECTED).toBe(true);
  return r.data.engineering_rules;
}

it("carries the BE and PY rules for a python file and no RV, FE or TS rule", async () => {
  const root = fixture();
  pythonProject(root);
  const found = await rules(root);
  const prefixes = new Set(found.map((rule) => rule.id.split("-")[0]));
  expect(prefixes.has("BE"), EXPECTED).toBe(true);
  expect(prefixes.has("PY"), EXPECTED).toBe(true);
  for (const banned of ["RV", "FE", "TS"]) {
    expect(prefixes.has(banned), EXPECTED).toBe(false);
  }
  for (const rule of found) {
    expect(typeof rule.rule, EXPECTED).toBe("string");
    expect(rule.rule.length, EXPECTED).toBeGreaterThan(0);
    expect(typeof rule.sign, EXPECTED).toBe("string");
    expect(rule.audience, EXPECTED).toBe("both");
  }
});

it("drops a rule that the project switched off", async () => {
  const root = fixture();
  pythonProject(root, '  disabled:\n    PY-03: "the service has no SQL"\n');
  const found = await rules(root);
  expect(found.some((rule) => rule.id.startsWith("PY-")), EXPECTED).toBe(true);
  expect(found.some((rule) => rule.id === "PY-03"), EXPECTED).toBe(false);
});

it("carries an empty array when the files match no rule but the RV ones", async () => {
  const root = fixture();
  plan(root, "src/message.txt", "tests/check.txt");
  commitAll(root, "plain files");
  expect(await rules(root), EXPECTED).toEqual([]);
});
