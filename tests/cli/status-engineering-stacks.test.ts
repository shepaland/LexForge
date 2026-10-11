import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "../helpers/run-cli.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const EXPECTED = "\nThe stacks gate is not implemented\n";

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    removeWorkspace(roots.pop()!);
  }
});

function workspace(config: string): string {
  const root = makeWorkspace({
    "lexforge/config.yaml": config,
    "lexforge/changes/demo/.lexforge.yaml": "schema: spec-driven\n",
  });
  roots.push(root);
  return root;
}

async function stacksOf(args: string[], root: string): Promise<unknown> {
  const { stdout } = await runCli([...args, "--json"], { cwd: root });
  const data = JSON.parse(stdout) as Record<string, unknown>;
  return "engineeringStacks" in data ? data.engineeringStacks : undefined;
}

const FORMS: Array<[string, string[]]> = [
  ["lexforge status", ["status"]],
  ["lexforge status --change demo", ["status", "--change", "demo"]],
];

describe.each(FORMS)("%s reports the project stacks", (_label, args) => {
  it("gives missing when the config has no engineering key", async () => {
    const root = workspace("schema: spec-driven\n");

    expect(await stacksOf(args, root), EXPECTED).toBe("missing");
  });

  it("gives an empty array for an explicit empty list", async () => {
    const root = workspace("schema: spec-driven\nengineering:\n  stacks: []\n");

    expect(await stacksOf(args, root), EXPECTED).toEqual([]);
  });

  it("gives both names for two stacks", async () => {
    const root = workspace("schema: spec-driven\nengineering:\n  stacks: [python, react]\n");

    expect(await stacksOf(args, root), EXPECTED).toEqual(["python", "react"]);
  });
});
