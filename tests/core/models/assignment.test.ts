import { describe, expect, it } from "vitest";

import {
  PIPELINE_STAGES,
  resolveStage,
  resolveStages,
} from "../../../src/core/models/assignment.js";
import type { ModelAssignment } from "../../../src/core/workspace/project-config.js";

const EMPTY: ModelAssignment = { default: null, tools: {}, providers: {} };

const DEFAULT_ONLY: ModelAssignment = {
  default: { provider: "anthropic", model: "claude-opus-5" },
  tools: {},
  providers: {},
};

const TWO_RUNTIMES: ModelAssignment = {
  default: { provider: "anthropic", model: "claude-opus-5" },
  tools: {
    codex: { provider: "openai", model: "gpt-5.6-sol" },
  },
  providers: {},
};

describe("таблица стадий", () => {
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
  it("каждая стадия кроме архивации отдаёт модель default", () => {
    for (const stage of PIPELINE_STAGES) {
      if (stage === "archive") {
        continue;
      }

      expect(resolveStage(DEFAULT_ONLY, stage)).toEqual({
        stage,
        provider: "anthropic",
        model: "claude-opus-5",
      });
    }
  });

  it("архивация модели не требует даже при заполненной секции", () => {
    expect(resolveStage(DEFAULT_ONLY, "archive")).toEqual({
      stage: "archive",
      provider: "",
      model: "",
    });
  });

  it("ответ роли не несёт", () => {
    expect("role" in resolveStage(DEFAULT_ONLY, "design")).toBe(false);
    expect("role" in resolveStage(DEFAULT_ONLY, "archive")).toBe(false);
  });

  it("пустое назначение оставляет провайдера и модель пустыми у каждой стадии", () => {
    for (const stage of PIPELINE_STAGES) {
      const resolved = resolveStage(EMPTY, stage);

      expect(resolved.stage).toBe(stage);
      expect(resolved.provider).toBe("");
      expect(resolved.model).toBe("");
    }
  });

  it("список стадий отдаётся целиком и в порядке таблицы", () => {
    expect(resolveStages(DEFAULT_ONLY).map((entry) => entry.stage)).toEqual([
      ...PIPELINE_STAGES,
    ]);
  });
});

// The block guards against a catalogue check being introduced later: no code of
// `resolveStage` reads `providers`, so it fails only if one starts to.
describe("имя вне каталога", () => {
  const OUTSIDE_CATALOGUE: ModelAssignment = {
    default: { provider: "z.ai", model: "glm-9.9" },
    tools: {},
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

  it("модель известного провайдера, которой каталог не держит, доходит слово в слово", () => {
    const catalogueMiss: ModelAssignment = {
      default: { provider: "anthropic", model: "claude-opus-6" },
      tools: {},
      providers: { anthropic: ["claude-opus-5"] },
    };

    expect(resolveStage(catalogueMiss, "specs").provider).toBe("anthropic");
    expect(resolveStage(catalogueMiss, "specs").model).toBe("claude-opus-6");
  });
});

describe("стадия вне таблицы", () => {
  const FILLED: ModelAssignment = {
    default: { provider: "anthropic", model: "claude-opus-5" },
    tools: {},
    providers: { anthropic: ["claude-opus-5"] },
  };

  it("артефакт чужой схемы модели не требует", () => {
    expect(resolveStage(FILLED, "release-notes")).toEqual({
      stage: "release-notes",
      provider: "",
      model: "",
    });
  });

  it("имя из прототипа объекта стадией не становится", () => {
    expect(resolveStage(FILLED, "constructor").model).toBe("");
  });
});

describe("рантайм вызова", () => {
  it("блок рантайма решает целиком, верхний уровень не читается", () => {
    expect(resolveStage(TWO_RUNTIMES, "design", "codex")).toEqual({
      stage: "design",
      provider: "openai",
      model: "gpt-5.6-sol",
    });
    expect(resolveStage(TWO_RUNTIMES, "apply", "codex").model).toBe("gpt-5.6-sol");
  });

  it("рантайм без блока уходит на верхний уровень", () => {
    expect(resolveStage(TWO_RUNTIMES, "design", "claude")).toEqual({
      stage: "design",
      provider: "anthropic",
      model: "claude-opus-5",
    });
  });

  it("вызов без имени рантайма читается как рантайм без блока", () => {
    expect(resolveStage(TWO_RUNTIMES, "design").model).toBe("claude-opus-5");
  });

  it("имя из прототипа объекта блоком рантайма не становится", () => {
    expect(resolveStage(TWO_RUNTIMES, "design", "constructor").model).toBe("claude-opus-5");
    expect(resolveStage(TWO_RUNTIMES, "design", "toString").provider).toBe("anthropic");
  });

  it("архивация модели не требует и в рантайме со своим блоком", () => {
    expect(resolveStage(TWO_RUNTIMES, "archive", "codex")).toEqual({
      stage: "archive",
      provider: "",
      model: "",
    });
  });

  it("список стадий разрешается для названного рантайма", () => {
    const stages = resolveStages(TWO_RUNTIMES, "codex");

    expect(stages.find((entry) => entry.stage === "verify")?.model).toBe("gpt-5.6-sol");
  });
});

describe("рантайм, которого никто не назвал", () => {
  const ONLY_TOOLS: ModelAssignment = {
    default: null,
    tools: {
      claude: { provider: "anthropic", model: "claude-opus-5" },
      codex: { provider: "openai", model: "gpt-5.6-sol" },
    },
    providers: {},
  };

  it("каждый названный рантайм разрешается в свою модель", () => {
    expect(resolveStage(ONLY_TOOLS, "design", "claude").model).toBe("claude-opus-5");
    expect(resolveStage(ONLY_TOOLS, "design", "codex").model).toBe("gpt-5.6-sol");
  });

  it("рантайм вне названных получает пустого провайдера и пустую модель", () => {
    for (const stage of PIPELINE_STAGES) {
      const resolved = resolveStage(ONLY_TOOLS, stage, "cursor");

      expect(resolved.provider).toBe("");
      expect(resolved.model).toBe("");
    }
  });

  it("разрешение такого рантайма не бросает", () => {
    expect(() => resolveStages(ONLY_TOOLS, "cursor")).not.toThrow();
  });

  it("секция с одним каталогом оставляет назначение пустым", () => {
    const catalogueOnly: ModelAssignment = {
      default: null,
      tools: {},
      providers: { anthropic: ["claude-opus-5"] },
    };

    expect(resolveStage(catalogueOnly, "specs", "claude").model).toBe("");
    expect(resolveStage(catalogueOnly, "specs").provider).toBe("");
  });
});
