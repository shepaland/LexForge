import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

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

async function call(argv: string[], cwd: string) {
  const capture = createCapture();
  const exitCode = await run(argv, { cwd, stdout: capture.stdout, stderr: capture.stderr });
  return { exitCode, capture };
}

describe("lexforge instructions", () => {
  it("при --json отдаёт разбираемый документ со следующим шагом", async () => {
    const root = workspace();

    const { exitCode, capture } = await call(
      ["instructions", "proposal", "--change", "add-auth", "--json"],
      root,
    );
    const data = JSON.parse(capture.out) as {
      outputVersion: number;
      artifact: { id: string; status: string };
      nextStep: string;
    };

    expect(exitCode).toBe(0);
    expect(data.outputVersion).toBe(1);
    expect(data.artifact.id).toBe("proposal");
    expect(data.artifact.status).toBe("ready");
    expect(data.nextStep).toBe("lexforge validate add-auth --strict");
  });

  it("без --json заканчивает вывод тем же следующим шагом", async () => {
    const root = workspace();

    const { exitCode, capture } = await call(
      ["instructions", "proposal", "--change", "add-auth"],
      root,
    );
    const lines = capture.out.trimEnd().split("\n");

    expect(exitCode).toBe(0);
    expect(lines.at(-1)).toBe("Next step: lexforge validate add-auth --strict");
    expect(capture.err).toBe("");
  });

  it("заблокированный артефакт даёт код 1 и пишет причину в поток ошибок", async () => {
    const root = workspace();

    const { exitCode, capture } = await call(
      ["instructions", "tasks", "--change", "add-auth"],
      root,
    );

    expect(exitCode).toBe(1);
    expect(capture.out).toBe("");
    expect(capture.err).toContain("specs, design");
    expect(capture.err).toContain("Next step: lexforge instructions specs --change add-auth");
  });

  it("без --change отвергает вызов кодом 2", async () => {
    const root = workspace();

    const { exitCode, capture } = await call(["instructions", "proposal"], root);

    expect(exitCode).toBe(2);
    expect(capture.out).toBe("");
  });

  it("артефакт вне схемы отвергается кодом 2 с перечислением артефактов", async () => {
    const root = workspace({
      "lexforge/changes/rename-menu/.lexforge.yaml": "schema: bounded\n",
    });

    const { exitCode, capture } = await call(
      ["instructions", "design", "--change", "rename-menu", "--json"],
      root,
    );
    const data = JSON.parse(capture.out) as { error: { code: string; message: string } };

    expect(exitCode).toBe(2);
    expect(data.error.code).toBe("artifact-unknown");
    expect(data.error.message).toContain("proposal, specs, tasks");
  });
});

describe("lexforge instructions: строка назначенной модели", () => {
  const MODELS = `schema: spec-driven
models:
  default:
    provider: anthropic
    model: claude-opus-5
`;

  it("человеческий вывод печатает провайдера и модель одной строкой", async () => {
    const root = workspace({ "lexforge/config.yaml": MODELS });

    const { exitCode, capture } = await call(
      ["instructions", "proposal", "--change", "add-auth"],
      root,
    );

    expect(exitCode).toBe(0);
    expect(capture.out).toMatch(/^Model: provider anthropic, model claude-opus-5$/m);
  });

  it("проект без раздела models строки о модели не печатает", async () => {
    const root = workspace();

    const { exitCode, capture } = await call(
      ["instructions", "proposal", "--change", "add-auth"],
      root,
    );

    expect(exitCode).toBe(0);
    expect(capture.out).not.toContain("Model: provider");
  });
});

describe("lexforge instructions: рантайм вызова", () => {
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

  it("человеческий вывод печатает модель названного рантайма", async () => {
    const root = workspace({ "lexforge/config.yaml": TWO_RUNTIMES });

    const { exitCode, capture } = await call(
      ["instructions", "proposal", "--change", "add-auth", "--tool", "codex"],
      root,
    );

    expect(exitCode).toBe(0);
    expect(capture.out).toMatch(/^Model: provider openai, model gpt-5\.6-sol$/m);
  });

  it("рантайм вне реестра вызов не останавливает", async () => {
    const root = workspace({ "lexforge/config.yaml": TWO_RUNTIMES });

    const { exitCode, capture } = await call(
      ["instructions", "proposal", "--change", "add-auth", "--tool", "hermes", "--json"],
      root,
    );
    const data = JSON.parse(capture.out) as { model: string };

    expect(exitCode).toBe(0);
    expect(data.model).toBe("claude-opus-5");
  });

  it("--tool отдаёт модель своего блока, а не верхнего уровня", async () => {
    const root = workspace({ "lexforge/config.yaml": TWO_RUNTIMES });

    const { exitCode, capture } = await call(
      ["instructions", "proposal", "--change", "add-auth", "--tool", "codex", "--json"],
      root,
    );
    const data = JSON.parse(capture.out) as { provider: string; model: string };

    expect(exitCode).toBe(0);
    expect(data.provider).toBe("openai");
    expect(data.model).toBe("gpt-5.6-sol");
  });

  it("без --tool читается верхний уровень секции", async () => {
    const root = workspace({ "lexforge/config.yaml": TWO_RUNTIMES });

    const { exitCode, capture } = await call(
      ["instructions", "proposal", "--change", "add-auth", "--json"],
      root,
    );
    const data = JSON.parse(capture.out) as { provider: string; model: string };

    expect(exitCode).toBe(0);
    expect(data.provider).toBe("anthropic");
    expect(data.model).toBe("claude-opus-5");
  });
});
