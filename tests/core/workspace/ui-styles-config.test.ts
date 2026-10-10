import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
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

// The newlines put the message on a line of its own, which the cycle runner matches whole.
const EXPECTED = "\nThe ui styles key is not read\n";

describe("readProjectConfig ui.styles", () => {
  it("reads the listed style files", () => {
    const root = workspace("ui:\n  styles:\n    - src/styles/app.css\n");

    expect(readProjectConfig(root).styleFiles, EXPECTED).toEqual(["src/styles/app.css"]);
  });

  it("gives null when the key is absent", () => {
    const root = workspace("schema: spec-driven\n");

    expect(readProjectConfig(root).styleFiles, EXPECTED).toBeNull();
  });

  it("refuses a styles value that is not a list of strings", () => {
    const root = workspace("ui:\n  styles: src/styles/app.css\n");

    let caught: unknown;
    try {
      readProjectConfig(root);
    } catch (error) {
      caught = error;
    }

    expect(caught, EXPECTED).toBeInstanceOf(UsageError);
    expect((caught as Error).message).toContain("ui.styles");
  });
});
