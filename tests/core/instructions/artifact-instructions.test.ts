import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import { answerPath } from "../../../src/core/answer-path.js";
import { artifactInstructions } from "../../../src/core/instructions/artifact-instructions.js";
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

describe("состав ответа artifactInstructions", () => {
  it("несёт поля из решения 10 и ничего сверх них", () => {
    const root = workspace();

    const result = artifactInstructions({ cwd: root, change: "add-auth", artifact: "proposal" });

    expect(Object.keys(result.data)).toEqual([
      "outputVersion",
      "workspaceRoot",
      "change",
      "schema",
      "artifact",
      "instruction",
      "template",
      "context",
      "rules",
      "language",
      "languageExplicit",
      "provider",
      "model",
      "dependencies",
      "blockedBy",
      "resolvedOutputPath",
      "outputKind",
      "nextStep",
    ]);
    expect(result.data.outputVersion).toBe(1);
    expect(result.data.workspaceRoot).toBe(answerPath(root));
    expect(result.data.change).toBe("add-auth");
    expect(result.data.schema).toBe("spec-driven");
    expect(result.exitCode).toBe(0);
  });

  it("описывает артефакт тремя полями и берёт тексты из схемы", () => {
    const root = workspace();

    const { data } = artifactInstructions({
      cwd: root,
      change: "add-auth",
      artifact: "proposal",
    });

    expect(Object.keys(data.artifact)).toEqual(["id", "description", "status"]);
    expect(data.artifact.id).toBe("proposal");
    expect(data.artifact.description).toBe("Why the change is needed and what it changes");
    expect(data.artifact.status).toBe("ready");
    expect(data.instruction).toContain("Write the proposal for this change.");
    expect(data.template).toContain("## Why");
    expect(data.resolvedOutputPath).toBe(
      answerPath(path.join(root, "lexforge/changes/add-auth/proposal.md")),
    );
    expect(data.outputKind).toBe("file");
  });
});

describe("зависимости артефакта", () => {
  it("перечисляет прямые requires в порядке схемы, с их статусами и путями", () => {
    const root = workspace({
      "lexforge/changes/add-auth/proposal.md": "why\n",
      "lexforge/changes/add-auth/design.md": "## Context\n",
    });

    const { data } = artifactInstructions({ cwd: root, change: "add-auth", artifact: "tasks" });

    expect(data.dependencies.map((entry) => entry.id)).toEqual(["specs", "design"]);
    expect(Object.keys(data.dependencies[0]!)).toEqual(["id", "status", "resolvedOutputPath"]);
    expect(data.dependencies[0]!.status).toBe("ready");
    expect(data.dependencies[0]!.resolvedOutputPath).toBe(
      answerPath(path.join(root, "lexforge/changes/add-auth/specs/**/*.md")),
    );
    expect(data.dependencies[1]!.status).toBe("done");
    expect(data.dependencies[1]!.resolvedOutputPath).toBe(
      answerPath(path.join(root, "lexforge/changes/add-auth/design.md")),
    );
  });

  it("у артефакта без requires список зависимостей пуст", () => {
    const root = workspace();

    const { data } = artifactInstructions({ cwd: root, change: "add-auth", artifact: "proposal" });

    expect(data.dependencies).toEqual([]);
  });
});

describe("контекст проекта и правила артефакта", () => {
  const CONFIG = [
    "schema: spec-driven",
    "context: A billing service for small shops.",
    "rules:",
    "  proposal:",
    "    - Name the price change in the first paragraph.",
    "  tasks:",
    "    - One task per file.",
    "",
  ].join("\n");

  it("берёт context и правила своего артефакта из config.yaml", () => {
    const root = workspace({ "lexforge/config.yaml": CONFIG });

    const { data } = artifactInstructions({ cwd: root, change: "add-auth", artifact: "proposal" });

    expect(data.context).toBe("A billing service for small shops.");
    expect(data.rules).toEqual(["Name the price change in the first paragraph."]);
  });

  it("без разделов в config.yaml отдаёт пустую строку и пустой список", () => {
    const root = workspace();

    const { data } = artifactInstructions({ cwd: root, change: "add-auth", artifact: "proposal" });

    expect(data.context).toBe("");
    expect(data.rules).toEqual([]);
  });

  it("правила чужого артефакта в ответ не попадают", () => {
    const root = workspace({ "lexforge/config.yaml": CONFIG });

    const { data } = artifactInstructions({ cwd: root, change: "add-auth", artifact: "specs" });

    expect(data.rules).toEqual([]);
  });
});

describe("язык артефактов", () => {
  it("без поля language в config.yaml отдаёт en и несделанный выбор", () => {
    const root = workspace();

    const { data } = artifactInstructions({ cwd: root, change: "add-auth", artifact: "proposal" });

    expect(data.language).toBe("en");
    expect(data.languageExplicit).toBe(false);
  });

  it("при language: ru отдаёт ru и сделанный выбор", () => {
    const root = workspace({
      "lexforge/config.yaml": "schema: spec-driven\nlanguage: ru\n",
    });

    const { data } = artifactInstructions({ cwd: root, change: "add-auth", artifact: "proposal" });

    expect(data.language).toBe("ru");
    expect(data.languageExplicit).toBe(true);
  });
});

describe("заблокированный артефакт", () => {
  it("даёт код 1 и называет незакрытые прямые зависимости", () => {
    const root = workspace();

    const result = artifactInstructions({ cwd: root, change: "add-auth", artifact: "tasks" });
    const text = result.lines.join("\n");

    expect(result.exitCode).toBe(1);
    expect(result.data.artifact.status).toBe("blocked");
    expect(result.data.blockedBy).toEqual(["specs", "design"]);
    expect(text).toContain("specs");
    expect(text).toContain("design");
    expect(text).not.toContain("proposal");
    expect(result.data.nextStep).toBe("lexforge instructions specs --change add-auth");
    expect(result.nextStep).toBe("lexforge instructions specs --change add-auth");
  });

  it("не выдаёт инструкцию и шаблон того, что писать ещё рано", () => {
    const root = workspace();

    const { data } = artifactInstructions({ cwd: root, change: "add-auth", artifact: "tasks" });

    expect(data.instruction).toBe("");
    expect(data.template).toBe("");
  });

  it("после закрытия одной зависимости остаётся вторая", () => {
    const root = workspace({
      "lexforge/changes/add-auth/proposal.md": "why\n",
      "lexforge/changes/add-auth/specs/auth/spec.md": "## Purpose\n",
    });

    const result = artifactInstructions({ cwd: root, change: "add-auth", artifact: "tasks" });

    expect(result.exitCode).toBe(1);
    expect(result.data.blockedBy).toEqual(["design"]);
    expect(result.data.nextStep).toBe("lexforge instructions design --change add-auth");
  });
});

describe("артефакт вне схемы", () => {
  it("отвергает запрос и перечисляет артефакты схемы change", () => {
    const root = workspace({
      "lexforge/changes/rename-menu/.lexforge.yaml": "schema: bounded\n",
    });

    const call = () =>
      artifactInstructions({ cwd: root, change: "rename-menu", artifact: "design" });

    expect(call).toThrow(UsageError);
    try {
      call();
      expect.unreachable("запрос должен быть отвергнут");
    } catch (error) {
      const usage = error as UsageError;
      expect(usage.code).toBe("artifact-unknown");
      expect(usage.message).toContain("design");
      expect(usage.message).toContain("bounded");
      expect(usage.message).toContain("proposal, specs, tasks");
    }
  });
});

describe("назначенная модель в ответе instructions", () => {
  const MODELS = `schema: spec-driven
models:
  default:
    provider: anthropic
    model: claude-opus-5
  review:
    provider: openai
    model: gpt-5.6-sol
`;

  it("артефакт планирования несёт роль analysis с провайдером и моделью", () => {
    const root = workspace({
      "lexforge/config.yaml": MODELS,
      "lexforge/changes/add-auth/proposal.md": "## Why\n\nPasswords are stored in the open.\n",
    });

    const { data } = artifactInstructions({
      cwd: root,
      change: "add-auth",
      artifact: "specs",
    });

    expect(data.provider).toBe("anthropic");
    expect(data.model).toBe("claude-opus-5");
    expect("role" in data).toBe(false);
  });

  it("проект без раздела models несёт пустые провайдера и модель", () => {
    const root = workspace();

    const result = artifactInstructions({
      cwd: root,
      change: "add-auth",
      artifact: "proposal",
    });

    expect(result.data.provider).toBe("");
    expect(result.data.model).toBe("");
    expect(result.exitCode).toBe(0);
  });
});
