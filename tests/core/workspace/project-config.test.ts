import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import { resolveStages } from "../../../src/core/models/assignment.js";
import { readProjectConfig } from "../../../src/core/workspace/project-config.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const created: string[] = [];

function workspace(config: string): string {
  const root = makeWorkspace({ "lexforge/config.yaml": config });
  created.push(root);
  return root;
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

const COMMENTED_ONLY = `# schema: spec-driven
# context: |
#   what this project is
# rules:
#   proposal:
#     - keep it short
# operations: {}
# verification: {}
`;

describe("readProjectConfig", () => {
  it("на одних закомментированных разделах даёт умолчания", () => {
    const config = readProjectConfig(workspace(COMMENTED_ONLY));

    expect(config.schema).toBe("spec-driven");
    expect(config.language).toBe("en");
    expect(config.languageExplicit).toBe(false);
    expect(config.context).toBe("");
    expect(config.rules).toEqual({});
  });

  it("выбранный язык читается как явный", () => {
    const config = readProjectConfig(workspace("language: ru\n"));

    expect(config.language).toBe("ru");
    expect(config.languageExplicit).toBe(true);
  });

  it("context и rules отдаются как есть", () => {
    const config = readProjectConfig(
      workspace("context: what this project is\nrules:\n  proposal:\n    - keep it short\n"),
    );

    expect(config.context).toBe("what this project is");
    expect(config.rules).toEqual({ proposal: ["keep it short"] });
  });

  it("неизвестные разделы верхнего уровня чтение не ломают", () => {
    const config = readProjectConfig(
      workspace("schema: bounded\noperations:\n  apply: go\nverification:\n  tests: npm test\n"),
    );

    expect(config.schema).toBe("bounded");
  });
});

describe("readProjectConfig: раздел verification", () => {
  it("метки проверок читаются парами", () => {
    const config = readProjectConfig(
      workspace("verification:\n  tests: npm test\n  lint: npm run lint\n"),
    );

    expect(config.verification).toEqual({ tests: "npm test", lint: "npm run lint" });
  });

  it("без раздела verification даёт пустой объект", () => {
    const config = readProjectConfig(workspace("schema: bounded\n"));

    expect(config.verification).toEqual({});
  });

  it("метка из строчных букв и дефисов принимается", () => {
    const config = readProjectConfig(workspace("verification:\n  unit-tests: npm test\n"));

    expect(config.verification).toEqual({ "unit-tests": "npm test" });
  });

  it("метка с пробелом и заглавными буквами останавливает чтение", () => {
    let caught: unknown;
    try {
      readProjectConfig(workspace("verification:\n  Unit Tests: npm test\n"));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(UsageError);
    expect((caught as UsageError).code).toBe("project-config-invalid");
    expect((caught as UsageError).message).toContain("Unit Tests");
    expect((caught as UsageError).message).toContain("lowercase");
    expect((caught as UsageError).message).toContain("unit-tests");
  });
});

describe("readProjectConfig: свои маркеры плейсхолдеров", () => {
  it("список plan_placeholders отдаётся строками", () => {
    const config = readProjectConfig(
      workspace("plan_placeholders:\n  - на усмотрение исполнителя\n  - потом решим\n"),
    );

    expect(config.planPlaceholders).toEqual(["на усмотрение исполнителя", "потом решим"]);
  });

  it("без списка отдаётся пустой массив", () => {
    const config = readProjectConfig(workspace("schema: bounded\n"));

    expect(config.planPlaceholders).toEqual([]);
  });
});

const MODELS_SECTION = `models:
  default:
    provider: anthropic
    model: claude-opus-5
  providers:
    anthropic:
      - claude-opus-5
      - claude-sonnet-5
    acme-internal:
      - acme-coder-2
`;

describe("readProjectConfig: раздел models", () => {
  it("default и каталог читаются вместе", () => {
    const config = readProjectConfig(workspace(MODELS_SECTION));

    expect(config.models.default).toEqual({ provider: "anthropic", model: "claude-opus-5" });
    expect(config.models.providers).toEqual({
      anthropic: ["claude-opus-5", "claude-sonnet-5"],
      "acme-internal": ["acme-coder-2"],
    });
  });

  it("без раздела models назначение пустое", () => {
    const config = readProjectConfig(workspace("schema: bounded\n"));

    expect(config.models.default).toBeNull();
    expect(config.models.providers).toEqual({});
  });
});

describe("readProjectConfig: пустой заголовок models", () => {
  it("раздел без содержимого читается как пустое назначение, а не как поломка", () => {
    const config = readProjectConfig(workspace("schema: spec-driven\nmodels:\n"));

    expect(config.models.default).toBeNull();
    expect(config.models.providers).toEqual({});
  });
});

describe("readProjectConfig: ключ роли из прежней версии", () => {
  it("ключ роли не читается, default и каталог остаются на месте", () => {
    const config = readProjectConfig(
      workspace(
        "models:\n" +
          "  default:\n    provider: anthropic\n    model: claude-opus-5\n" +
          "  analysis:\n    provider: openai\n    model: gpt-5.6-sol\n" +
          "  providers:\n    anthropic:\n      - claude-opus-5\n",
      ),
    );

    expect(config.models.default).toEqual({ provider: "anthropic", model: "claude-opus-5" });
    expect(config.models.providers).toEqual({ anthropic: ["claude-opus-5"] });

    for (const stage of resolveStages(config.models)) {
      if (stage.stage === "archive") {
        continue;
      }

      expect(stage.model, `стадия ${stage.stage} ушла с модели default`).toBe("claude-opus-5");
    }
  });
});

describe("readProjectConfig: сломанный default", () => {
  it("default строкой вместо пары останавливает чтение и называет поле и форму", () => {
    let caught: unknown;
    try {
      readProjectConfig(workspace("models:\n  default: claude-opus-5\n"));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(UsageError);
    expect((caught as UsageError).code).toBe("project-config-invalid");
    expect((caught as UsageError).message).toContain("models.default");
    expect((caught as UsageError).message).toMatch(/a provider and a model/);
  });
});

describe("readProjectConfig: блоки рантаймов", () => {
  it("каждый рантайм читается со своим провайдером и своей моделью", () => {
    const config = readProjectConfig(
      workspace(
        "models:\n" +
          "  tools:\n" +
          "    claude:\n      provider: anthropic\n      model: claude-opus-5\n" +
          "    codex:\n      provider: openai\n      model: gpt-5.6-sol\n",
      ),
    );

    expect(config.models.tools.claude).toEqual({
      provider: "anthropic",
      model: "claude-opus-5",
    });
    expect(config.models.tools.codex).toEqual({ provider: "openai", model: "gpt-5.6-sol" });
    expect(config.models.default).toBeNull();
  });

  it("без блоков рантаймов таблица пустая", () => {
    const config = readProjectConfig(workspace("schema: bounded\n"));

    expect(config.models.tools).toEqual({});
  });
});

describe("readProjectConfig: сломанный блок рантайма", () => {
  it("блок строкой вместо пары останавливает чтение и называет рантайм и форму", () => {
    let caught: unknown;
    try {
      readProjectConfig(workspace("models:\n  tools:\n    codex: gpt-5.6-sol\n"));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(UsageError);
    expect((caught as UsageError).code).toBe("project-config-invalid");
    expect((caught as UsageError).message).toContain("models.tools.codex");
    expect((caught as UsageError).message).toMatch(/a provider and a model/);
  });
});
