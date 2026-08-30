import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { answerPath } from "../../../src/core/answer-path.js";
import { changeStatus } from "../../../src/core/status/change-status.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const created: string[] = [];

function workspace(files: Record<string, string> = {}): string {
  const root = makeWorkspace({
    "lexforge/config.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
    ...files,
  });
  created.push(root);
  return root;
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

describe("состав ответа changeStatus", () => {
  it("несёт поля из решения 10 и ничего сверх них", () => {
    const root = workspace();

    const result = changeStatus({ cwd: root, change: "add-auth" });

    expect(Object.keys(result.data)).toEqual([
      "outputVersion",
      "workspaceRoot",
      "change",
      "schema",
      "isPlanningComplete",
      "artifacts",
      "nextStep",
    ]);
    expect(result.data.outputVersion).toBe(1);
    expect(result.data.workspaceRoot).toBe(answerPath(root));
    expect(result.data.change).toBe("add-auth");
    expect(result.data.schema).toBe("spec-driven");
    expect(result.data.isPlanningComplete).toBe(false);
    expect(result.exitCode).toBe(0);
  });

  it("каждый артефакт несёт семь полей своего состояния", () => {
    const root = workspace();

    const { data } = changeStatus({ cwd: root, change: "add-auth" });
    const proposal = data.artifacts[0]!;

    expect(data.artifacts.map((artifact) => artifact.id)).toEqual([
      "proposal",
      "specs",
      "design",
      "tasks",
    ]);
    expect(Object.keys(proposal)).toEqual([
      "id",
      "description",
      "status",
      "requires",
      "blockedBy",
      "resolvedOutputPath",
      "outputKind",
    ]);
    expect(proposal.status).toBe("ready");
    expect(proposal.requires).toEqual([]);
    expect(proposal.blockedBy).toEqual([]);
    expect(proposal.resolvedOutputPath).toBe(
      answerPath(path.join(root, "lexforge/changes/add-auth/proposal.md")),
    );
    expect(proposal.outputKind).toBe("file");
  });
});

describe("человеческий вывод changeStatus", () => {
  function lineFor(lines: string[], id: string): string {
    return lines.find((line) => line.trim().startsWith(id))!;
  }

  it("называет статус каждого артефакта и незакрытые зависимости", () => {
    const root = workspace();

    const { lines } = changeStatus({ cwd: root, change: "add-auth" });

    expect(lineFor(lines, "proposal")).toContain("ready");
    expect(lineFor(lines, "tasks")).toContain("blocked");
    expect(lineFor(lines, "tasks")).toContain("blocked by: specs, design");
    expect(lineFor(lines, "proposal")).not.toContain("blocked by:");
  });
});

describe("следующий шаг changeStatus", () => {
  const WRITTEN = {
    "lexforge/changes/add-auth/proposal.md": "why\n",
    "lexforge/changes/add-auth/specs/auth/spec.md": "## Purpose\n",
    "lexforge/changes/add-auth/design.md": "## Context\n",
    "lexforge/changes/add-auth/tasks.md": "- [ ] 1.1 do it\n",
  };

  it("у только что заведённого change ведёт к первому артефакту", () => {
    const root = workspace();

    const result = changeStatus({ cwd: root, change: "add-auth" });

    expect(result.data.nextStep).toBe("lexforge instructions proposal --change add-auth");
    expect(result.lines.at(-1)).not.toContain("Next step");
  });

  it("после первого артефакта ведёт к следующему готовому", () => {
    const root = workspace({ "lexforge/changes/add-auth/proposal.md": "why\n" });

    const result = changeStatus({ cwd: root, change: "add-auth" });

    expect(result.data.nextStep).toBe("lexforge instructions specs --change add-auth");
  });

  it("при всех написанных артефактах зовёт к реализации", () => {
    const root = workspace(WRITTEN);

    const result = changeStatus({ cwd: root, change: "add-auth" });

    expect(result.data.isPlanningComplete).toBe(true);
    expect(result.data.nextStep).toContain("implement");
    expect(result.lines.join("\n")).toContain("Planning is complete");
  });
});
