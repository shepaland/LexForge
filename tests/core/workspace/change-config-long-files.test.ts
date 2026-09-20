import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import { readChangeConfig } from "../../../src/core/workspace/change-config.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const created: string[] = [];

function workspace(changeConfig: string): string {
  const root = makeWorkspace({
    "lexforge/config.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-auth/.lexforge.yaml": changeConfig,
  });
  created.push(root);
  return root;
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

describe("readChangeConfig: long_files", () => {
  it("long_files: refactor даёт longFilePath refactor", () => {
    const config = readChangeConfig(
      workspace("schema: spec-driven\nlong_files: refactor\n"),
      "add-auth",
    );

    expect(config.longFilePath).toBe("refactor");
  });

  it("long_files: keep даёт longFilePath keep", () => {
    const config = readChangeConfig(
      workspace("schema: spec-driven\nlong_files: keep\n"),
      "add-auth",
    );

    expect(config.longFilePath).toBe("keep");
  });

  it("без ключа long_files longFilePath равен null", () => {
    const config = readChangeConfig(workspace("schema: spec-driven\n"), "add-auth");

    expect(config.longFilePath).toBeNull();
  });

  it("long_files: split отвергается с указанием refactor и keep", () => {
    const root = workspace("schema: spec-driven\nlong_files: split\n");

    try {
      readChangeConfig(root, "add-auth");
      expect.unreachable("ожидалось исключение");
    } catch (error) {
      expect(error).toBeInstanceOf(UsageError);
      expect((error as UsageError).code).toBe("change-config-invalid");
      expect((error as UsageError).message).toContain("long_files");
      expect((error as UsageError).message).toContain("refactor");
      expect((error as UsageError).message).toContain("keep");
    }
  });

  it("long_files: true отвергается с указанием refactor и keep", () => {
    const root = workspace("schema: spec-driven\nlong_files: true\n");

    try {
      readChangeConfig(root, "add-auth");
      expect.unreachable("ожидалось исключение");
    } catch (error) {
      expect(error).toBeInstanceOf(UsageError);
      expect((error as UsageError).code).toBe("change-config-invalid");
      expect((error as UsageError).message).toContain("long_files");
      expect((error as UsageError).message).toContain("refactor");
      expect((error as UsageError).message).toContain("keep");
    }
  });
});
