import { afterEach, describe, expect, it } from "vitest";

import { readProjectConfig } from "../../../src/core/workspace/project-config.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const created: string[] = [];

function workspace(config: string): string {
  const root = makeWorkspace({ "lexforge/config.yaml": config });
  created.push(root);
  return root;
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

// The newlines put the message on a line of its own, so a red run is matched by that line whole.
const EXPECTED = "\nThe engineering key is not read\n";

type Engineering = { stacks: string[] | null; disabled: Record<string, string> };

function engineering(config: string): Engineering | undefined {
  return (readProjectConfig(workspace(config)) as { engineering?: Engineering }).engineering;
}

describe("readProjectConfig engineering", () => {
  it("gives no stacks and no switched-off rules without the key", () => {
    const section = engineering("schema: spec-driven\n");

    expect(section?.stacks, EXPECTED).toBeNull();
    expect(section?.disabled, EXPECTED).toEqual({});
  });

  it("keeps an empty stack list as an empty array", () => {
    expect(engineering("engineering:\n  stacks: []\n")?.stacks, EXPECTED).toEqual([]);
  });

  it("keeps the stacks in the written order", () => {
    expect(engineering("engineering:\n  stacks: [python, react]\n")?.stacks, EXPECTED).toEqual([
      "python",
      "react",
    ]);
  });

  it("keeps a stack name outside the twelve as written", () => {
    expect(engineering("engineering:\n  stacks: [elixir]\n")?.stacks, EXPECTED).toEqual(["elixir"]);
  });

  it("reads the switched-off rules with their reasons", () => {
    const section = engineering('engineering:\n  disabled:\n    FE-14: "the product has one language"\n');

    expect(section?.disabled, EXPECTED).toEqual({ "FE-14": "the product has one language" });
  });

  it("keeps an empty reason as an empty string", () => {
    expect(engineering('engineering:\n  disabled:\n    FE-14: ""\n')?.disabled, EXPECTED).toEqual({
      "FE-14": "",
    });
  });

  it("rejects a reason written as a number", () => {
    const root = workspace("engineering:\n  disabled:\n    FE-14: 5\n");

    expect(() => readProjectConfig(root)).toThrowError(
      expect.objectContaining({ code: "project-config-invalid" }),
    );
  });
});
