import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { readProjectConfig } from "../../src/core/workspace/project-config.js";
import { createCapture } from "../helpers/capture.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const EXPECTED = "\ncommander rejects the unknown command `stores`\n";

const CONFIG = "# project settings\nschema: spec-driven\nlanguage: en\n";
const WITH_MAIN = `${CONFIG}data_stores:\n  - name: main\n    dialect: postgresql\n`;

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    removeWorkspace(roots.pop()!);
  }
});

function workspace(config: string): string {
  const root = makeWorkspace({ "lexforge/config.yaml": config });
  roots.push(root);
  return root;
}

function configOf(root: string): string {
  return readFileSync(path.join(root, "lexforge/config.yaml"), "utf8");
}

async function call(argv: string[], cwd: string) {
  const capture = createCapture();
  const exitCode = await run(argv, { cwd, stdout: capture.stdout, stderr: capture.stderr });
  return { exitCode, capture };
}

/** Output that is not JSON becomes an empty object, so the assertions fail instead of the parse. */
function parsed(out: string): Record<string, unknown> {
  return out.trim() === "" ? {} : (JSON.parse(out) as Record<string, unknown>);
}

function parsedError(out: string): { error: { code?: string; message?: string } } {
  const document = parsed(out) as { error?: { code?: string; message?: string } };
  return { error: document.error ?? {} };
}

describe("lexforge stores add", () => {
  it("saves the first store of a config without the key and prints the three SQL files", async () => {
    const root = workspace(CONFIG);

    const { exitCode, capture } = await call(
      ["stores", "add", "main", "--dialect", "postgresql", "--json"],
      root,
    );
    const data = parsed(capture.out);

    expect(exitCode, EXPECTED).toBe(0);
    expect(readProjectConfig(root).stores, EXPECTED).toEqual([{ name: "main", dialect: "postgresql" }]);
    expect(data.outputVersion, EXPECTED).toBe(1);
    expect(data.name, EXPECTED).toBe("main");
    expect(data.dialect, EXPECTED).toBe("postgresql");
    expect(data.format, EXPECTED).toBe("sql");
    expect(data.nextStep, EXPECTED).toContain("schema.sql");
    expect(data.nextStep, EXPECTED).toContain("up.sql");
    expect(data.nextStep, EXPECTED).toContain("down.sql");
    expect(data.nextStep, EXPECTED).toContain("data/main");
  });

  it("appends a second store after the first, gives markdown for mongodb and keeps a comment", async () => {
    const root = workspace(CONFIG);

    await call(["stores", "add", "main", "--dialect", "postgresql", "--json"], root);
    const { exitCode, capture } = await call(
      ["stores", "add", "events", "--dialect", "mongodb", "--json"],
      root,
    );
    const data = parsed(capture.out);

    expect(exitCode, EXPECTED).toBe(0);
    expect(readProjectConfig(root).stores, EXPECTED).toEqual([
      { name: "main", dialect: "postgresql" },
      { name: "events", dialect: "mongodb" },
    ]);
    expect(data.format, EXPECTED).toBe("markdown");
    expect(data.nextStep, EXPECTED).toContain("schema.md");
    expect(data.nextStep, EXPECTED).toContain("up.md");
    expect(data.nextStep, EXPECTED).toContain("down.md");
    expect(configOf(root), EXPECTED).toContain("# project settings\nschema: spec-driven\nlanguage: en\n");
  });

  it("saves the dialect in lower case", async () => {
    const root = workspace(CONFIG);

    const { exitCode, capture } = await call(
      ["stores", "add", "main", "--dialect", "PostgreSQL", "--json"],
      root,
    );
    const data = parsed(capture.out);

    expect(exitCode, EXPECTED).toBe(0);
    expect(readProjectConfig(root).stores, EXPECTED).toEqual([{ name: "main", dialect: "postgresql" }]);
    expect(data.dialect, EXPECTED).toBe("postgresql");
  });

  it("exits 2, names the store and leaves the config alone when the name is taken", async () => {
    const root = workspace(WITH_MAIN);

    const { exitCode, capture } = await call(
      ["stores", "add", "main", "--dialect", "mysql", "--json"],
      root,
    );
    const document = parsedError(capture.out);

    expect(exitCode, EXPECTED).toBe(2);
    expect(document.error.code, EXPECTED).toBe("store-name-taken");
    expect(document.error.message, EXPECTED).toContain("main");
    expect(configOf(root), EXPECTED).toBe(WITH_MAIN);
  });

  it("exits 2 and leaves the config alone when the name is not kebab-case", async () => {
    const root = workspace(WITH_MAIN);

    const { exitCode, capture } = await call(
      ["stores", "add", "Main_DB", "--dialect", "mysql", "--json"],
      root,
    );
    const document = parsedError(capture.out);

    expect(exitCode, EXPECTED).toBe(2);
    expect(document.error.code, EXPECTED).toBe("store-name-invalid");
    expect(document.error.message, EXPECTED).toContain("Main_DB");
    expect(configOf(root), EXPECTED).toBe(WITH_MAIN);
  });

  it("exits 2 and leaves the config alone when the dialect is empty", async () => {
    const root = workspace(WITH_MAIN);

    const { exitCode, capture } = await call(
      ["stores", "add", "events", "--dialect", "", "--json"],
      root,
    );
    const document = parsedError(capture.out);

    expect(exitCode, EXPECTED).toBe(2);
    expect(document.error.code, EXPECTED).toBe("store-dialect-empty");
    expect(configOf(root), EXPECTED).toBe(WITH_MAIN);
  });

  it("exits 2 and names the add subcommand for a bare stores", async () => {
    const root = workspace(CONFIG);

    const { exitCode, capture } = await call(["stores"], root);

    expect(exitCode, EXPECTED).toBe(2);
    expect(capture.err, EXPECTED).toContain('"lexforge stores" needs a subcommand');
    expect(capture.err, EXPECTED).toContain("add");
    expect(configOf(root), EXPECTED).toBe(CONFIG);
  });
});
