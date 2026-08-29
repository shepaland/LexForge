import { describe, expect, it } from "vitest";

import { loadSchema } from "../../src/core/schemas/load-schema.js";

describe("встроенная схема spec-driven", () => {
  it("несёт четыре артефакта в порядке proposal, specs, design, tasks", () => {
    const schema = loadSchema("spec-driven");

    expect(schema.artifacts.map((artifact) => artifact.id)).toEqual([
      "proposal",
      "specs",
      "design",
      "tasks",
    ]);
  });

  it("описывает рёбра requires", () => {
    const schema = loadSchema("spec-driven");
    const requires = Object.fromEntries(
      schema.artifacts.map((artifact) => [artifact.id, artifact.requires]),
    );

    expect(requires["proposal"]).toEqual([]);
    expect(requires["specs"]).toEqual(["proposal"]);
    expect(requires["design"]).toEqual(["proposal"]);
    expect(requires["tasks"]).toEqual(["specs", "design"]);
  });

  it("описывает пути на выходе", () => {
    const schema = loadSchema("spec-driven");
    const generates = Object.fromEntries(
      schema.artifacts.map((artifact) => [artifact.id, artifact.generates]),
    );

    expect(generates).toEqual({
      proposal: "proposal.md",
      specs: "specs/**/*.md",
      design: "design.md",
      tasks: "tasks.md",
    });
  });
});

describe("встроенная схема bounded", () => {
  it("несёт три артефакта без design", () => {
    const schema = loadSchema("bounded");

    expect(schema.artifacts.map((artifact) => artifact.id)).toEqual([
      "proposal",
      "specs",
      "tasks",
    ]);
  });

  it("tasks требует specs", () => {
    const schema = loadSchema("bounded");
    const tasks = schema.artifacts.find((artifact) => artifact.id === "tasks");

    expect(tasks?.requires).toEqual(["specs"]);
  });
});
