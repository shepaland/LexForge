import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import { computeChangeState } from "../../../src/core/artifact-graph/graph.js";
import { createChange } from "../../../src/core/change/create-change.js";
import { loadSchema } from "../../../src/core/schemas/load-schema.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const created: string[] = [];

function workspace(files: Record<string, string> = {}): string {
  const root = makeWorkspace({ "lexforge/config.yaml": "schema: spec-driven\n", ...files });
  created.push(root);
  return root;
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

function changeConfigText(root: string, name: string): string {
  return readFileSync(path.join(root, "lexforge/changes", name, ".lexforge.yaml"), "utf8");
}

describe("createChange", () => {
  it("на свободном имени пишет каталог change и его конфигурацию", () => {
    const root = workspace();

    const result = createChange({ cwd: root, name: "add-auth" });
    const config = changeConfigText(root, "add-auth");

    expect(result.exitCode).toBe(0);
    expect(config).toContain("schema: spec-driven");
    expect(config).not.toContain("skip_");
    expect(result.nextStep).toBe("lexforge instructions proposal --change add-auth");
  });

  it("со схемой bounded пишет её в конфигурацию и заводит три артефакта", () => {
    const root = workspace();

    const result = createChange({ cwd: root, name: "rename-menu", schema: "bounded" });
    const state = computeChangeState({
      schema: loadSchema("bounded"),
      changeDir: path.join(root, "lexforge/changes/rename-menu"),
      filled: {},
    });

    expect(result.exitCode).toBe(0);
    expect(changeConfigText(root, "rename-menu")).toContain("schema: bounded");
    expect(state.artifacts.map((artifact) => artifact.id)).toEqual([
      "proposal",
      "specs",
      "tasks",
    ]);
  });
});

/** Every refusal is a `UsageError`, and `run()` turns it into exit code 2. */
function refusal(call: () => unknown): UsageError {
  try {
    call();
  } catch (error) {
    expect(error).toBeInstanceOf(UsageError);
    return error as UsageError;
  }
  return expect.unreachable("ожидалось исключение");
}

describe("createChange отвергает вызов", () => {
  it("имя не в kebab-case: показывает исправленное написание", () => {
    const root = workspace();

    const error = refusal(() => createChange({ cwd: root, name: "Add Auth" }));

    expect(error.code).toBe("change-name-invalid");
    expect(error.message).toContain("add-auth");
    expect(existsSync(path.join(root, "lexforge/changes/Add Auth"))).toBe(false);
  });

  it("имя занято активным change: файл в нём остаётся прежним", () => {
    const root = workspace({
      "lexforge/changes/add-auth/.lexforge.yaml": "schema: bounded\n",
    });

    const error = refusal(() => createChange({ cwd: root, name: "add-auth" }));

    expect(error.code).toBe("change-name-taken");
    expect(changeConfigText(root, "add-auth")).toBe("schema: bounded\n");
  });

  it("имя занято архивным change", () => {
    const root = workspace({
      "lexforge/changes/archive/2026-01-01-add-auth/.lexforge.yaml": "schema: bounded\n",
    });

    const error = refusal(() => createChange({ cwd: root, name: "add-auth" }));

    expect(error.code).toBe("change-name-taken");
    expect(error.message).toContain("2026-01-01-add-auth");
  });

  it("неизвестная схема: перечисляет встроенные схемы", () => {
    const root = workspace();

    const error = refusal(() => createChange({ cwd: root, name: "add-auth", schema: "nosuch" }));

    expect(error.code).toBe("schema-unknown");
    expect(error.message).toContain("bounded, spec-driven");
    expect(existsSync(path.join(root, "lexforge/changes/add-auth"))).toBe(false);
  });
});
