import path from "node:path";

import { describe, expect, it } from "vitest";

import { computeChangeState } from "../../../src/core/artifact-graph/graph.js";
import { loadSchema } from "../../../src/core/schemas/load-schema.js";

const CHANGE_DIR = path.resolve("/abs/project/lexforge/changes/add-auth");

function state(filled: Record<string, boolean>, skippedArtifacts: string[] = []) {
  return computeChangeState({
    schema: loadSchema("spec-driven"),
    changeDir: CHANGE_DIR,
    filled,
    skippedArtifacts,
  });
}

function statuses(filled: Record<string, boolean>, skippedArtifacts: string[] = []) {
  return Object.fromEntries(
    state(filled, skippedArtifacts).artifacts.map((artifact) => [artifact.id, artifact.status]),
  );
}

function blockedBy(filled: Record<string, boolean>, id: string): string[] {
  return state(filled).artifacts.find((artifact) => artifact.id === id)!.blockedBy;
}

describe("computeChangeState", () => {
  it("только что заведённый change открывает один proposal", () => {
    expect(statuses({})).toEqual({
      proposal: "ready",
      specs: "blocked",
      design: "blocked",
      tasks: "blocked",
    });
  });

  it("написанный proposal открывает specs и design", () => {
    expect(statuses({ proposal: true })).toEqual({
      proposal: "done",
      specs: "ready",
      design: "ready",
      tasks: "blocked",
    });
    expect(blockedBy({ proposal: true }, "tasks")).toEqual(["specs", "design"]);
  });

  it("зависимость через промежуточный артефакт в список не попадает", () => {
    expect(blockedBy({}, "tasks")).toEqual(["specs", "design"]);
    expect(blockedBy({}, "tasks")).not.toContain("proposal");
  });

  it("пропущенный артефакт закрывает зависимость наравне с написанным", () => {
    expect(statuses({ proposal: true, design: true }, ["specs"])).toEqual({
      proposal: "done",
      specs: "skipped",
      design: "done",
      tasks: "ready",
    });
  });
});

describe("признак завершённого планирования", () => {
  it("истинен, когда написаны все четыре артефакта", () => {
    expect(
      state({ proposal: true, specs: true, design: true, tasks: true }).isPlanningComplete,
    ).toBe(true);
  });

  it("ложен, когда не написан последний артефакт", () => {
    expect(state({ proposal: true, specs: true, design: true }).isPlanningComplete).toBe(false);
  });

  it("истинен, когда спеки пропущены, а остальное написано", () => {
    expect(
      state({ proposal: true, design: true, tasks: true }, ["specs"]).isPlanningComplete,
    ).toBe(true);
  });
});
