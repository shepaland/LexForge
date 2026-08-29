import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import {
  listActiveChanges,
  readChangeConfig,
} from "../../../src/core/workspace/change-config.js";
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

describe("readChangeConfig", () => {
  it("одно поле schema даёт пустой список пропущенных артефактов", () => {
    const config = readChangeConfig(workspace("schema: spec-driven\n"), "add-auth");

    expect(config.schema).toBe("spec-driven");
    expect(config.skippedArtifacts).toEqual([]);
  });

  it("skip_specs: true пропускает артефакт specs", () => {
    const config = readChangeConfig(
      workspace("schema: spec-driven\nskip_specs: true\n"),
      "add-auth",
    );

    expect(config.skippedArtifacts).toEqual(["specs"]);
  });

  it("skip_specs: false ничего не пропускает", () => {
    const config = readChangeConfig(
      workspace("schema: spec-driven\nskip_specs: false\n"),
      "add-auth",
    );

    expect(config.skippedArtifacts).toEqual([]);
  });

  it("пропуск несуществующего артефакта отвергается со списком артефактов схемы", () => {
    const root = workspace("schema: spec-driven\nskip_nosuch: true\n");

    try {
      readChangeConfig(root, "add-auth");
      expect.unreachable("ожидалось исключение");
    } catch (error) {
      expect(error).toBeInstanceOf(UsageError);
      expect((error as UsageError).code).toBe("change-config-invalid");
      for (const id of ["proposal", "specs", "design", "tasks"]) {
        expect((error as UsageError).message).toContain(id);
      }
    }
  });
});

describe("listActiveChanges", () => {
  function twoChanges(): string {
    const root = makeWorkspace({
      "lexforge/config.yaml": "schema: spec-driven\n",
      "lexforge/changes/rename-menu/.lexforge.yaml": "schema: bounded\n",
      "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
      "lexforge/changes/archive/2026-01-01-old-change/.lexforge.yaml": "schema: bounded\n",
    });
    created.push(root);
    return root;
  }

  it("перечисляет активные changes по алфавиту и пропускает archive", () => {
    expect(listActiveChanges(twoChanges())).toEqual(["add-auth", "rename-menu"]);
  });

  it("на пустом рабочем пространстве отдаёт пустой список", () => {
    const root = makeWorkspace({ "lexforge/config.yaml": "schema: spec-driven\n" });
    created.push(root);

    expect(listActiveChanges(root)).toEqual([]);
  });

  it("несуществующий change даёт change-not-found со списком активных", () => {
    const root = twoChanges();

    try {
      readChangeConfig(root, "nosuch");
      expect.unreachable("ожидалось исключение");
    } catch (error) {
      expect(error).toBeInstanceOf(UsageError);
      expect((error as UsageError).code).toBe("change-not-found");
      expect((error as UsageError).message).toContain("add-auth");
      expect((error as UsageError).message).toContain("rename-menu");
    }
  });
});
