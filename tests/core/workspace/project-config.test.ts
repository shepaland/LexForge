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

const COMMENTED_ONLY = `# schema: spec-driven
# context: |
#   what this project is
# rules:
#   proposal:
#     - keep it short
# operations: {}
# verification: {}
`;

describe("readProjectConfig", () => {
  it("на одних закомментированных разделах даёт умолчания", () => {
    const config = readProjectConfig(workspace(COMMENTED_ONLY));

    expect(config.schema).toBe("spec-driven");
    expect(config.language).toBe("en");
    expect(config.languageExplicit).toBe(false);
    expect(config.context).toBe("");
    expect(config.rules).toEqual({});
  });

  it("выбранный язык читается как явный", () => {
    const config = readProjectConfig(workspace("language: ru\n"));

    expect(config.language).toBe("ru");
    expect(config.languageExplicit).toBe(true);
  });

  it("context и rules отдаются как есть", () => {
    const config = readProjectConfig(
      workspace("context: what this project is\nrules:\n  proposal:\n    - keep it short\n"),
    );

    expect(config.context).toBe("what this project is");
    expect(config.rules).toEqual({ proposal: ["keep it short"] });
  });

  it("неизвестные разделы верхнего уровня чтение не ломают", () => {
    const config = readProjectConfig(
      workspace("schema: bounded\noperations:\n  apply: go\nverification:\n  tests: npm test\n"),
    );

    expect(config.schema).toBe("bounded");
  });
});
