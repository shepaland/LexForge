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
      "stages",
      "nextStep",
    ]);
    expect(result.data.outputVersion).toBe(1);
    expect(result.data.workspaceRoot).toBe(answerPath(root));
    expect(result.data.change).toBe("add-auth");
    expect(result.data.schema).toBe("spec-driven");
    expect(result.data.isPlanningComplete).toBe(false);
    expect(result.exitCode).toBe(0);
  });

  it("каждый артефакт несёт девять полей своего состояния", () => {
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
      "model",
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

describe("назначение по стадиям в ответе changeStatus", () => {
  const MODELS = `schema: spec-driven
models:
  default:
    provider: anthropic
    model: claude-opus-5
  tools:
    codex:
      provider: openai
      model: gpt-5.6-sol
`;

  it("каждая стадия пайплайна названа с провайдером и моделью", () => {
    const root = workspace({ "lexforge/config.yaml": MODELS });

    const { data } = changeStatus({ cwd: root, change: "add-auth" });

    expect(data.stages.map((entry) => entry.stage)).toEqual([
      "proposal",
      "specs",
      "design",
      "tasks",
      "apply",
      "debug",
      "verify",
      "archive",
    ]);
    expect(Object.keys(data.stages[0]!)).toEqual(["stage", "provider", "model"]);
  });

  it("стадии без артефакта несут модель верхнего уровня", () => {
    const root = workspace({ "lexforge/config.yaml": MODELS });

    const { data } = changeStatus({ cwd: root, change: "add-auth" });
    const byStage = Object.fromEntries(data.stages.map((entry) => [entry.stage, entry]));

    expect(byStage.apply).toEqual({
      stage: "apply",
      provider: "anthropic",
      model: "claude-opus-5",
    });
    expect(byStage.debug!.model).toBe("claude-opus-5");
    expect(byStage.verify).toEqual({
      stage: "verify",
      provider: "anthropic",
      model: "claude-opus-5",
    });
  });

  it("названный рантайм уводит каждую стадию на свой блок", () => {
    const root = workspace({ "lexforge/config.yaml": MODELS });

    const { data } = changeStatus({ cwd: root, change: "add-auth", tool: "codex" });
    const byStage = Object.fromEntries(data.stages.map((entry) => [entry.stage, entry]));

    expect(byStage.apply).toEqual({
      stage: "apply",
      provider: "openai",
      model: "gpt-5.6-sol",
    });
    expect(data.artifacts[0]!.model).toBe("gpt-5.6-sol");
  });

  it("архивация приходит с пустыми провайдером и моделью", () => {
    const root = workspace({ "lexforge/config.yaml": MODELS });

    const { data } = changeStatus({ cwd: root, change: "add-auth" });
    const archive = data.stages.find((entry) => entry.stage === "archive")!;

    expect(archive).toEqual({ stage: "archive", provider: "", model: "" });
  });

  it("артефакты несут модель рядом со своим статусом", () => {
    const root = workspace({ "lexforge/config.yaml": MODELS });

    const { data } = changeStatus({ cwd: root, change: "add-auth" });

    for (const artifact of data.artifacts) {
      expect(artifact.model).toBe("claude-opus-5");
    }
  });

  it("проект без раздела models оставляет провайдера и модель пустыми, код возврата ноль", () => {
    const root = workspace();

    const result = changeStatus({ cwd: root, change: "add-auth" });

    expect(result.exitCode).toBe(0);
    for (const entry of result.data.stages) {
      expect(entry.provider).toBe("");
      expect(entry.model).toBe("");
    }
    expect(result.data.artifacts[0]!.model).toBe("");
  });
});
