import { describe, expect, it } from "vitest";

import {
  PIPELINE_STAGES,
  resolveStage,
  resolveStages,
  stageRole,
} from "../../../src/core/models/assignment.js";
import type { ModelAssignment } from "../../../src/core/workspace/project-config.js";

const EMPTY: ModelAssignment = { default: null, roles: {}, providers: {} };

const DEFAULT_ONLY: ModelAssignment = {
  default: { provider: "anthropic", model: "claude-opus-5" },
  roles: {},
  providers: {},
};

const THREE_MODELS: ModelAssignment = {
  default: { provider: "anthropic", model: "claude-opus-5" },
  roles: {
    analysis: { provider: "anthropic", model: "claude-sonnet-5" },
    review: { provider: "openai", model: "gpt-5.6-sol" },
  },
  providers: {},
};

describe("таблица стадий и ролей", () => {
  it("четыре артефакта планирования несут роль analysis", () => {
    expect(stageRole("proposal")).toBe("analysis");
    expect(stageRole("specs")).toBe("analysis");
    expect(stageRole("design")).toBe("analysis");
    expect(stageRole("tasks")).toBe("analysis");
  });

  it("цикл реализации и отладка несут роль development", () => {
    expect(stageRole("apply")).toBe("development");
    expect(stageRole("debug")).toBe("development");
  });

  it("проверка завершения несёт роль review, архивация — ни одной", () => {
    expect(stageRole("verify")).toBe("review");
    expect(stageRole("archive")).toBeNull();
  });

  it("таблица покрывает все восемь стадий пайплайна", () => {
    expect(PIPELINE_STAGES).toEqual([
      "proposal",
      "specs",
      "design",
      "tasks",
      "apply",
      "debug",
      "verify",
      "archive",
    ]);
  });
});

describe("разрешение стадии в модель", () => {
  it("один default отдаёт свою модель каждой стадии с ролью", () => {
    expect(resolveStage(DEFAULT_ONLY, "design")).toEqual({
      stage: "design",
      role: "analysis",
      provider: "anthropic",
      model: "claude-opus-5",
    });
    expect(resolveStage(DEFAULT_ONLY, "apply").model).toBe("claude-opus-5");
    expect(resolveStage(DEFAULT_ONLY, "verify").model).toBe("claude-opus-5");
  });

  it("переопределение роли поднимает свою стадию, остальные остаются на default", () => {
    expect(resolveStage(THREE_MODELS, "verify")).toEqual({
      stage: "verify",
      role: "review",
      provider: "openai",
      model: "gpt-5.6-sol",
    });
    expect(resolveStage(THREE_MODELS, "specs").model).toBe("claude-sonnet-5");
    expect(resolveStage(THREE_MODELS, "apply").model).toBe("claude-opus-5");
  });

  it("архивация модели не требует даже при заполненной секции", () => {
    expect(resolveStage(THREE_MODELS, "archive")).toEqual({
      stage: "archive",
      role: "",
      provider: "",
      model: "",
    });
  });

  it("пустое назначение оставляет провайдера и модель пустыми у каждой стадии", () => {
    for (const stage of PIPELINE_STAGES) {
      const resolved = resolveStage(EMPTY, stage);

      expect(resolved.provider).toBe("");
      expect(resolved.model).toBe("");
    }

    expect(resolveStage(EMPTY, "specs").role).toBe("analysis");
  });

  it("список стадий отдаётся целиком и в порядке таблицы", () => {
    expect(resolveStages(THREE_MODELS).map((entry) => entry.stage)).toEqual([
      ...PIPELINE_STAGES,
    ]);
  });
});

// The block guards against a catalogue check being introduced later: no code of
// `resolveStage` reads `providers`, so it fails only if one starts to.
describe("имя вне каталога", () => {
  const OUTSIDE_CATALOGUE: ModelAssignment = {
    default: { provider: "anthropic", model: "claude-opus-5" },
    roles: { development: { provider: "z.ai", model: "glm-9.9" } },
    providers: { anthropic: ["claude-opus-5"] },
  };

  it("модель, которой каталог не держит, доходит до ответа слово в слово", () => {
    const resolved = resolveStage(OUTSIDE_CATALOGUE, "apply");

    expect(resolved.provider).toBe("z.ai");
    expect(resolved.model).toBe("glm-9.9");
  });

  it("провайдер, которого каталог не держит, разрешение не останавливает", () => {
    expect(() => resolveStage(OUTSIDE_CATALOGUE, "debug")).not.toThrow();
    expect(resolveStage(OUTSIDE_CATALOGUE, "debug").provider).toBe("z.ai");
  });
});

describe("стадия вне таблицы", () => {
  const FILLED: ModelAssignment = {
    default: { provider: "anthropic", model: "claude-opus-5" },
    roles: {},
    providers: { anthropic: ["claude-opus-5"] },
  };

  it("модель известного провайдера, которой каталог не держит, доходит слово в слово", () => {
    const catalogueMiss: ModelAssignment = {
      default: { provider: "anthropic", model: "claude-opus-6" },
      roles: {},
      providers: { anthropic: ["claude-opus-5"] },
    };

    expect(resolveStage(catalogueMiss, "specs").provider).toBe("anthropic");
    expect(resolveStage(catalogueMiss, "specs").model).toBe("claude-opus-6");
  });

  it("артефакт чужой схемы роли не получает и модели не требует", () => {
    expect(resolveStage(FILLED, "release-notes")).toEqual({
      stage: "release-notes",
      role: "",
      provider: "",
      model: "",
    });
  });

  it("имя из прототипа объекта ролью не становится", () => {
    expect(stageRole("constructor")).toBeNull();
    expect(resolveStage(FILLED, "constructor").model).toBe("");
  });
});
