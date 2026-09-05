import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const created: string[] = [];

function workspace(files: Record<string, string> = {}): string {
  const root = makeWorkspace({
    "lexforge/config.yaml": "schema: spec-driven\n",
    "lexforge/changes/archive/": "",
    ...files,
  });
  created.push(root);
  return root;
}

function bareDirectory(): string {
  const root = makeWorkspace();
  created.push(root);
  return root;
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

async function call(argv: string[], cwd: string) {
  const capture = createCapture();
  const exitCode = await run(argv, { cwd, stdout: capture.stdout, stderr: capture.stderr });
  return { exitCode, capture };
}

describe("lexforge status", () => {
  it("неизвестный change даёт код 2 и список активных changes", async () => {
    const root = workspace({
      "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
      "lexforge/changes/rename-menu/.lexforge.yaml": "schema: bounded\n",
    });

    const { exitCode, capture } = await call(["status", "--change", "nosuch"], root);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("add-auth");
    expect(capture.err).toContain("rename-menu");
    expect(capture.out).toBe("");
  });

  it("вне рабочего пространства даёт код 2 и зовёт инициализацию", async () => {
    const { exitCode, capture } = await call(["status"], bareDirectory());

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("Next step: lexforge init");
    expect(capture.out).toBe("");
  });

  it("статус одного change заканчивает вывод следующим шагом", async () => {
    const root = workspace({
      "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
    });

    const { exitCode, capture } = await call(["status", "--change", "add-auth"], root);
    const lines = capture.out.trimEnd().split("\n");

    expect(exitCode).toBe(0);
    expect(lines.at(-1)).toBe("Next step: lexforge instructions proposal --change add-auth");
  });
});

describe("разделение потоков при машинном выводе", () => {
  it("в stdout уходит один документ JSON, человеческие строки — в stderr", async () => {
    const root = workspace({
      "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
    });

    const { exitCode, capture } = await call(["status", "--json"], root);
    const data = JSON.parse(capture.out) as { changes: Array<{ name: string }> };

    expect(exitCode).toBe(0);
    expect(data.changes.map((change) => change.name)).toEqual(["add-auth"]);
    expect(capture.err).toContain("Active changes:");
    expect(capture.err).toContain("add-auth");
  });

  it("ошибка при машинном выводе печатается в stdout одним документом JSON", async () => {
    const root = workspace({
      "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
    });

    const { exitCode, capture } = await call(["status", "--change", "nosuch", "--json"], root);
    const data = JSON.parse(capture.out) as {
      outputVersion: number;
      error: { code: string; message: string };
      nextStep: string;
    };

    expect(exitCode).toBe(2);
    expect(data.outputVersion).toBe(1);
    expect(data.error.code).toBe("change-not-found");
    expect(data.error.message).toContain("add-auth");
    expect(data).toHaveProperty("nextStep");
  });

  it("отсутствие рабочего пространства при машинном выводе называет инициализацию", async () => {
    const { exitCode, capture } = await call(["status", "--json"], bareDirectory());
    const data = JSON.parse(capture.out) as {
      error: { code: string };
      nextStep: string;
    };

    expect(exitCode).toBe(2);
    expect(data.error.code).toBe("workspace-not-found");
    expect(data.nextStep).toBe("lexforge init");
  });
});

describe("lexforge status: назначенные модели в человеческом выводе", () => {
  const MODELS = `schema: spec-driven
models:
  default:
    provider: anthropic
    model: claude-opus-5
`;

  it("модель стоит рядом с каждым артефактом", async () => {
    const root = workspace({
      "lexforge/config.yaml": MODELS,
      "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
    });

    const { exitCode, capture } = await call(["status", "--change", "add-auth"], root);

    expect(exitCode).toBe(0);
    expect(capture.out).toMatch(/^ +proposal +ready +claude-opus-5$/m);
  });

  it("стадии без артефакта печатаются со своими моделями, архивация — без модели", async () => {
    const root = workspace({
      "lexforge/config.yaml": MODELS,
      "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
    });

    const { capture } = await call(["status", "--change", "add-auth"], root);

    expect(capture.out).toContain("Stages without an artifact:");
    expect(capture.out).toMatch(/^ +apply +claude-opus-5$/m);
    expect(capture.out).toMatch(/^ +verify +claude-opus-5$/m);
    expect(capture.out).toMatch(/^ +archive +no model demanded$/m);
  });

  it("проект без раздела models печатает статус как раньше", async () => {
    const root = workspace({
      "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
    });

    const { capture } = await call(["status", "--change", "add-auth"], root);

    expect(capture.out).not.toContain("Stages without an artifact:");
    expect(capture.out).toMatch(/^ +proposal +ready$/m);
  });
});

describe("lexforge status: схема bounded и неполное назначение", () => {
  const MODELS = `schema: spec-driven
models:
  default:
    provider: anthropic
    model: claude-opus-5
`;

  const OTHER_RUNTIME_ONLY = `schema: spec-driven
models:
  tools:
    codex:
      provider: openai
      model: gpt-5.6-sol
`;

  it("стадия, которой в схеме нет артефакта, попадает в блок стадий", async () => {
    const root = workspace({
      "lexforge/config.yaml": MODELS,
      "lexforge/changes/rename-menu/.lexforge.yaml": "schema: bounded\n",
    });

    const { capture } = await call(["status", "--change", "rename-menu"], root);

    expect(capture.out).toMatch(/^ +design +claude-opus-5$/m);
    expect(capture.out).not.toMatch(/^ +design +(ready|blocked)/m);
  });

  it("модель чужого рантайма своему вызову блока стадий не печатает", async () => {
    const root = workspace({
      "lexforge/config.yaml": OTHER_RUNTIME_ONLY,
      "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
    });

    const { capture } = await call(["status", "--change", "add-auth", "--tool", "claude"], root);

    expect(capture.out).not.toContain("Stages without an artifact:");
    expect(capture.out).toMatch(/^ +proposal +ready$/m);
  });

  it("архивация в рантайме со своим блоком печатается как стадия без модели", async () => {
    const root = workspace({
      "lexforge/config.yaml": OTHER_RUNTIME_ONLY,
      "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
    });

    const { capture } = await call(["status", "--change", "add-auth", "--tool", "codex"], root);

    expect(capture.out).toMatch(/^ +apply +gpt-5\.6-sol$/m);
    expect(capture.out).toMatch(/^ +archive +no model demanded$/m);
  });
});

describe("lexforge status: рантайм вызова", () => {
  const TWO_RUNTIMES = `schema: spec-driven
models:
  default:
    provider: anthropic
    model: claude-opus-5
  tools:
    codex:
      provider: openai
      model: gpt-5.6-sol
`;

  function change(): Record<string, string> {
    return {
      "lexforge/config.yaml": TWO_RUNTIMES,
      "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
    };
  }

  it("--tool разрешает каждую стадию по блоку своего рантайма", async () => {
    const root = workspace(change());

    const { exitCode, capture } = await call(
      ["status", "--change", "add-auth", "--tool", "codex", "--json"],
      root,
    );
    const data = JSON.parse(capture.out) as {
      stages: { stage: string; model: string }[];
      artifacts: { id: string; model: string }[];
    };

    expect(exitCode).toBe(0);
    expect(data.stages.find((stage) => stage.stage === "apply")?.model).toBe("gpt-5.6-sol");
    expect(data.artifacts[0]?.model).toBe("gpt-5.6-sol");
  });

  it("без --tool каждая стадия читает верхний уровень секции", async () => {
    const root = workspace(change());

    const { exitCode, capture } = await call(["status", "--change", "add-auth", "--json"], root);
    const data = JSON.parse(capture.out) as { stages: { stage: string; model: string }[] };

    expect(exitCode).toBe(0);
    expect(data.stages.find((stage) => stage.stage === "apply")?.model).toBe("claude-opus-5");
  });

  it("сломанный блок рантайма останавливает команду кодом 2", async () => {
    const root = workspace({
      "lexforge/config.yaml": "models:\n  tools:\n    codex: gpt-5.6-sol\n",
      "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
    });

    const { exitCode, capture } = await call(
      ["status", "--change", "add-auth", "--tool", "codex", "--json"],
      root,
    );
    const data = JSON.parse(capture.out) as { error: { code: string; message: string } };

    expect(exitCode).toBe(2);
    expect(data.error.code).toBe("project-config-invalid");
    expect(data.error.message).toContain("models.tools.codex");
  });

  it("--tool с рантаймом вне реестра не останавливает вызов", async () => {
    const root = workspace(change());

    const { exitCode, capture } = await call(
      ["status", "--change", "add-auth", "--tool", "hermes", "--json"],
      root,
    );
    const data = JSON.parse(capture.out) as { stages: { stage: string; model: string }[] };

    expect(exitCode).toBe(0);
    expect(data.stages.find((stage) => stage.stage === "apply")?.model).toBe("claude-opus-5");
  });
});
