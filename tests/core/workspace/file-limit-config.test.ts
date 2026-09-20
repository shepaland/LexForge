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

const DEFAULT_PATTERNS = [
  "**/*.ts",
  "**/*.tsx",
  "**/*.js",
  "**/*.jsx",
  "**/*.mjs",
  "**/*.cjs",
  "**/*.py",
  "**/*.go",
  "**/*.rs",
  "**/*.java",
  "**/*.kt",
  "**/*.kts",
  "**/*.swift",
  "**/*.rb",
  "**/*.php",
  "**/*.cs",
  "**/*.c",
  "**/*.h",
  "**/*.cc",
  "**/*.cpp",
  "**/*.hpp",
  "**/*.scala",
  "**/*.vue",
  "**/*.svelte",
];

describe("readProjectConfig — file_limit", () => {
  it("с отсутствующим разделом даёт умолчания", () => {
    const config = readProjectConfig(workspace("schema: spec-driven\n"));

    expect(config.sizeLimit.max).toBe(400);
    expect(config.sizeLimit.patterns).toEqual(DEFAULT_PATTERNS);
  });

  it("своё число строк заменяет умолчание, список остаётся прежним", () => {
    const config = readProjectConfig(
      workspace("file_limit:\n  lines: 330\n"),
    );

    expect(config.sizeLimit.max).toBe(330);
    expect(config.sizeLimit.patterns).toEqual(DEFAULT_PATTERNS);
  });

  it("свой список заменяет умолчание целиком, а не дополняет его", () => {
    const config = readProjectConfig(
      workspace('file_limit:\n  include:\n    - "src/**/*.ts"\n'),
    );

    expect(config.sizeLimit.max).toBe(400);
    expect(config.sizeLimit.patterns).toEqual(["src/**/*.ts"]);
  });

  it("lines: 0 отвергается как сломанный file_limit", () => {
    expect(() => readProjectConfig(workspace("file_limit:\n  lines: 0\n"))).toThrow(UsageError);
    expect(() => readProjectConfig(workspace("file_limit:\n  lines: 0\n"))).toThrow(/file_limit/);
  });

  it("lines: -5 отвергается как сломанный file_limit", () => {
    expect(() => readProjectConfig(workspace("file_limit:\n  lines: -5\n"))).toThrow(UsageError);
    expect(() => readProjectConfig(workspace("file_limit:\n  lines: -5\n"))).toThrow(/file_limit/);
  });

  it("lines: 12.5 отвергается как сломанный file_limit", () => {
    expect(() => readProjectConfig(workspace("file_limit:\n  lines: 12.5\n"))).toThrow(
      UsageError,
    );
    expect(() => readProjectConfig(workspace("file_limit:\n  lines: 12.5\n"))).toThrow(
      /file_limit/,
    );
  });

  it("include: [] отвергается как сломанный file_limit", () => {
    expect(() => readProjectConfig(workspace("file_limit:\n  include: []\n"))).toThrow(
      UsageError,
    );
    expect(() => readProjectConfig(workspace("file_limit:\n  include: []\n"))).toThrow(
      /file_limit/,
    );
  });
});
