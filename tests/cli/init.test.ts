import { existsSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const created: string[] = [];

function project(): string {
  const root = makeWorkspace();
  created.push(root);
  return root;
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

async function init(argv: string[], cwd: string) {
  const capture = createCapture();
  const exitCode = await run(argv, { cwd, stdout: capture.stdout, stderr: capture.stderr });
  return { exitCode, capture };
}

describe("lexforge init", () => {
  it("даёт код 0 и заканчивает вывод следующим шагом", async () => {
    const root = project();

    const { exitCode, capture } = await init(["init"], root);
    const lines = capture.out.trimEnd().split("\n");

    expect(exitCode).toBe(0);
    expect(lines.at(-1)).toBe("Next step: lexforge new change <name>");
    expect(existsSync(path.join(root, "lexforge/config.yaml"))).toBe(true);
  });

  it("с флагом машинного вывода печатает один документ JSON", async () => {
    const root = project();

    const { exitCode, capture } = await init(["init", "--json"], root);
    const data = JSON.parse(capture.out) as Record<string, unknown>;

    expect(exitCode).toBe(0);
    expect(data.outputVersion).toBe(1);
    expect(data.workspaceRoot).toBe(root);
    expect(data.created).toEqual(expect.arrayContaining([path.join(root, "lexforge/config.yaml")]));
    expect(data.unchanged).toEqual([]);
    expect(data.nextStep).toBe("lexforge new change <name>");
  });

  it("флаг языка пишется в config.yaml", async () => {
    const root = project();

    const { exitCode } = await init(["init", "--language", "ru"], root);

    expect(exitCode).toBe(0);
    expect(existsSync(path.join(root, "lexforge/config.yaml"))).toBe(true);
  });

  it("неизвестный инструмент даёт код 2 и не пишет ни одного файла", async () => {
    const root = project();

    const { exitCode, capture } = await init(["init", "--tools", "claude,nosuch"], root);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("nosuch");
    expect(existsSync(path.join(root, "lexforge"))).toBe(false);
    expect(existsSync(path.join(root, ".claude"))).toBe(false);
  });
});
