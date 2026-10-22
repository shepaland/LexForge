import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import { projectConfigText } from "../../../src/core/init/config-template.js";
import { readChangeConfig } from "../../../src/core/workspace/change-config.js";
import { readProjectConfig } from "../../../src/core/workspace/project-config.js";
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

function refusal(run: () => unknown): UsageError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(UsageError);
    return error as UsageError;
  }
  throw new Error("expected a UsageError, nothing was thrown");
}

describe("removed config keys", () => {
  it("refuses a config that still carries file_limit", () => {
    const root = workspace({
      "lexforge/config.yaml": "schema: spec-driven\nfile_limit:\n  lines: 400\n",
    });

    const error = refusal(() => readProjectConfig(root));

    expect(error.code).toBe("file-limit-removed");
    expect(error.nextStep).toBe("lexforge migrate");
  });

  it("refuses a change that still carries long_files", () => {
    const root = workspace({
      "lexforge/config.yaml": "schema: spec-driven\n",
      "lexforge/changes/demo/.lexforge.yaml": "schema: spec-driven\nlong_files: keep\n",
    });

    const error = refusal(() => readChangeConfig(root, "demo"));

    expect(error.code).toBe("long-files-removed");
    expect(error.nextStep).toBe("lexforge migrate --change demo");
  });

  it("writes no file_limit into a fresh config", () => {
    expect(projectConfigText()).not.toContain("file_limit");
  });

  it("reads a config without the key", () => {
    const root = workspace({ "lexforge/config.yaml": "schema: spec-driven\n" });

    expect(readProjectConfig(root)).not.toHaveProperty("sizeLimit");
  });
});
