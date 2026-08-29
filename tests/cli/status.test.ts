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
