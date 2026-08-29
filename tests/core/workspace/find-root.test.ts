import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import { findWorkspaceRoot } from "../../../src/core/workspace/find-root.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const created: string[] = [];

function workspace(files: Record<string, string>): string {
  const root = makeWorkspace(files);
  created.push(root);
  return root;
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

function caught(cwd: string): UsageError {
  try {
    findWorkspaceRoot(cwd);
  } catch (error) {
    if (error instanceof UsageError) {
      return error;
    }
    throw error;
  }
  throw new Error(`ожидалось исключение для каталога ${cwd}`);
}

describe("findWorkspaceRoot", () => {
  it("находит корень из вложенного каталога", () => {
    const root = workspace({
      "lexforge/config.yaml": "schema: spec-driven\n",
      "a/b/c/": "",
    });

    expect(findWorkspaceRoot(path.join(root, "a", "b", "c"))).toBe(
      findWorkspaceRoot(root),
    );
  });

  it("без каталога lexforge даёт workspace-not-found и зовёт init", () => {
    const root = workspace({ "src/index.ts": "export {};\n" });

    const error = caught(root);

    expect(error.code).toBe("workspace-not-found");
    expect(error.nextStep).toBe("lexforge init");
  });

  it("каталог lexforge без config.yaml даёт workspace-incomplete", () => {
    const root = workspace({ "lexforge/specs/": "" });

    expect(caught(root).code).toBe("workspace-incomplete");
  });
});
