import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const created: string[] = [];

function workspace(): string {
  const root = makeWorkspace({ "lexforge/config.yaml": "schema: spec-driven\n" });
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

describe("lexforge new change", () => {
  it("последняя строка вывода совпадает с полем следующего шага в JSON", async () => {
    const human = await call(["new", "change", "add-auth"], workspace());
    const machine = await call(["new", "change", "add-auth", "--json"], workspace());

    const lines = human.capture.out.trimEnd().split("\n");
    const data = JSON.parse(machine.capture.out) as { nextStep: string };

    expect(human.exitCode).toBe(0);
    expect(machine.exitCode).toBe(0);
    expect(lines.at(-1)).toBe(`Next step: ${data.nextStep}`);
    expect(data.nextStep).toBe("lexforge instructions proposal --change add-auth");
  });

  it("флаг схемы доходит до конфигурации change", async () => {
    const root = workspace();

    const { exitCode, capture } = await call(
      ["new", "change", "rename-menu", "--schema", "bounded", "--json"],
      root,
    );
    const data = JSON.parse(capture.out) as { schema: string; change: string };

    expect(exitCode).toBe(0);
    expect(data.schema).toBe("bounded");
    expect(data.change).toBe("rename-menu");
  });

  it("имя не в kebab-case даёт код 2 и исправленное написание в потоке ошибок", async () => {
    const { exitCode, capture } = await call(["new", "change", "Add Auth"], workspace());

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("add-auth");
    expect(capture.out).toBe("");
  });
});
