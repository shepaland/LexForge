import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { answerPath } from "../../../src/core/answer-path.js";
import { checkVerification, checkWorkspace } from "../../../src/core/doctor/checks.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const created: string[] = [];

function project(files: Record<string, string> = {}): string {
  const root = makeWorkspace(files);
  created.push(root);
  return root;
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

describe("checkWorkspace", () => {
  it("на каталоге без lexforge/ даёт находку с командой lexforge init", () => {
    const root = project();

    const result = checkWorkspace(root);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain("lexforge init");
  });

  it("на заведённом рабочем пространстве не даёт ничего", () => {
    const root = project({ "lexforge/config.yaml": "schema: spec-driven\n" });

    const result = checkWorkspace(root);

    expect(result.findings).toEqual([]);
  });

  it("на синтаксически битом config.yaml даёт находку вместо исключения", () => {
    const root = project({ "lexforge/config.yaml": "schema: [unterminated\n" });

    const result = checkWorkspace(root);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.rule).toBeTruthy();
    expect(result.findings[0]!.path).toBe(answerPath(path.join(root, "lexforge/config.yaml")));
  });

  it("на каталоге lexforge/ без config.yaml находка называет путь известного файла", () => {
    const root = project({ "lexforge/": "" });

    const result = checkWorkspace(root);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.rule).toBe("workspace-incomplete");
    expect(result.findings[0]!.path).toBe(answerPath(path.join(root, "lexforge/config.yaml")));
  });
});

describe("checkVerification", () => {
  it("на пустом разделе verification даёт находку с примером двух меток", () => {
    const result = checkVerification({});

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain("tests");
    expect(result.findings[0]!.message).toContain("lint");
  });

  it("на непустом разделе verification не даёт ничего", () => {
    const result = checkVerification({ tests: "npm test" });

    expect(result.findings).toEqual([]);
  });
});
