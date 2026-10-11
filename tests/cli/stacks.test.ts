import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

import { run } from "../../src/cli/run.js";
import { KNOWN_STACKS } from "../../src/core/rules/stacks.js";
import { createCapture } from "../helpers/capture.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const EXPECTED = "\nThe stacks gate is not implemented\n";

const CONFIG = "# project settings\nschema: spec-driven\nlanguage: en\n";

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    removeWorkspace(roots.pop()!);
  }
});

function workspace(): string {
  const root = makeWorkspace({ "lexforge/config.yaml": CONFIG });
  roots.push(root);
  return root;
}

function stacksOf(root: string): unknown {
  return (parse(configOf(root)) as { engineering?: { stacks?: unknown } }).engineering?.stacks;
}

function configOf(root: string): string {
  return readFileSync(path.join(root, "lexforge/config.yaml"), "utf8");
}

async function call(argv: string[], cwd: string) {
  const capture = createCapture();
  const exitCode = await run(argv, { cwd, stdout: capture.stdout, stderr: capture.stderr });
  return { exitCode, capture };
}

describe("lexforge stacks set", () => {
  it("writes two stacks and keeps the rest of the config", async () => {
    const root = workspace();

    const { exitCode } = await call(["stacks", "set", "python", "react"], root);
    const text = configOf(root);

    expect(exitCode, EXPECTED).toBe(0);
    expect(stacksOf(root), EXPECTED).toEqual(["python", "react"]);
    expect(text, EXPECTED).toContain("# project settings\nschema: spec-driven\nlanguage: en\n");
  });

  it("replaces the list on a second run", async () => {
    const root = workspace();

    await call(["stacks", "set", "python", "react"], root);
    const { exitCode } = await call(["stacks", "set", "go"], root);
    const text = configOf(root);

    expect(exitCode, EXPECTED).toBe(0);
    expect(stacksOf(root), EXPECTED).toEqual(["go"]);
    expect(text, EXPECTED).not.toContain("python");
    expect(text, EXPECTED).toContain("# project settings\nschema: spec-driven\nlanguage: en\n");
  });

  it("writes an empty list with --none", async () => {
    const root = workspace();

    const { exitCode } = await call(["stacks", "set", "--none"], root);

    expect(exitCode, EXPECTED).toBe(0);
    expect(stacksOf(root), EXPECTED).toEqual([]);
  });

  it("refuses an unknown stack with exit 1, names it and the twelve known ones, writes nothing", async () => {
    const root = workspace();

    const { exitCode, capture } = await call(["stacks", "set", "elixir"], root);
    const message = capture.out + capture.err;

    expect(exitCode, EXPECTED).toBe(1);
    expect(message, EXPECTED).toContain("elixir");
    for (const stack of KNOWN_STACKS) {
      expect(message, EXPECTED).toContain(stack.name);
    }
    expect(configOf(root), EXPECTED).toBe(CONFIG);
  });

  it("refuses a mix of known and unknown stacks and writes nothing", async () => {
    const root = workspace();

    const { exitCode } = await call(["stacks", "set", "python", "elixir"], root);

    expect(exitCode, EXPECTED).toBe(1);
    expect(configOf(root), EXPECTED).toBe(CONFIG);
  });

  it("exits 2 with stacks-not-given when neither a stack nor --none is given", async () => {
    const root = workspace();

    const { exitCode, capture } = await call(["stacks", "set", "--json"], root);

    expect(exitCode, EXPECTED).toBe(2);
    expect(capture.out + capture.err, EXPECTED).toContain("stacks-not-given");
  });

  it("exits 2 with stacks-conflict when a stack comes with --none", async () => {
    const root = workspace();

    const { exitCode, capture } = await call(["stacks", "set", "python", "--none", "--json"], root);

    expect(exitCode, EXPECTED).toBe(2);
    expect(capture.out + capture.err, EXPECTED).toContain("stacks-conflict");
    expect(configOf(root), EXPECTED).toBe(CONFIG);
  });

  it("prints outputVersion, stacks and nextStep with --json", async () => {
    const root = workspace();

    const { exitCode, capture } = await call(["stacks", "set", "python", "react", "--json"], root);
    const data = exitCode === 0 ? (JSON.parse(capture.out) as Record<string, unknown>) : {};

    expect(exitCode, EXPECTED).toBe(0);
    expect(data.outputVersion, EXPECTED).toBe(1);
    expect(data.stacks, EXPECTED).toEqual(["python", "react"]);
    expect(typeof data.nextStep, EXPECTED).toBe("string");
  });
});
