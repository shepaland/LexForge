import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveOutputPath } from "../../../src/core/artifact-graph/resolve-path.js";

const CHANGE_DIR = path.resolve("/abs/project/lexforge/changes/add-auth");

describe("resolveOutputPath", () => {
  it("для одного файла даёт абсолютный путь", () => {
    const resolved = resolveOutputPath(CHANGE_DIR, "proposal.md");

    expect(resolved.resolvedOutputPath).toBe(path.join(CHANGE_DIR, "proposal.md"));
    expect(resolved.outputKind).toBe("file");
  });

  it("для набора файлов даёт абсолютный глоб", () => {
    const resolved = resolveOutputPath(CHANGE_DIR, "specs/**/*.md");

    expect(resolved.resolvedOutputPath).toBe(path.join(CHANGE_DIR, "specs/**/*.md"));
    expect(resolved.outputKind).toBe("glob");
  });
});
