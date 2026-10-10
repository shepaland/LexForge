import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const CONFIG = "schema: spec-driven\nlanguage: en\ncontext: Keep me.\n";
const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) removeWorkspace(roots.pop()!);
});

function workspace(): string {
  const root = makeWorkspace({
    "lexforge/config.yaml": CONFIG,
    "src/styles/app.css": ".a { color: red; }\n",
    "src/styles/other.css": ".b { color: blue; }\n",
    "src/readme.txt": "text\n",
    "node_modules/lib/x.css": ".x {}\n",
    "dist/a.css": ".d {}\n",
    "build/b.css": ".e {}\n",
    "lexforge/c.css": ".c {}\n",
  });
  roots.push(root);
  return root;
}

async function call(argv: string[], cwd: string) {
  const capture = createCapture();
  const exitCode = await run(argv, { cwd, stdout: capture.stdout, stderr: capture.stderr });
  return { exitCode, capture };
}

function config(root: string): string {
  return readFileSync(path.join(root, "lexforge", "config.yaml"), "utf8");
}

describe("lexforge styles", () => {
  it("find lists the project CSS alone, one path per line", async () => {
    const root = workspace();
    const { exitCode, capture } = await call(["styles", "find"], root);

    if (exitCode !== 0) {
      expect.fail("not wired\nThe styles commands are not implemented\n");
    }
    const paths = capture.out.split("\n").filter((line) => line.startsWith("src/"));
    expect(paths).toEqual(["src/styles/app.css", "src/styles/other.css"]);
    expect(capture.out).not.toContain("node_modules");
    expect(capture.out).not.toContain("dist/");
    expect(capture.out).not.toContain("build/");
    expect(capture.out).not.toContain("lexforge/c.css");
  });

  it("find --json prints the paths with a next step", async () => {
    const root = workspace();
    const { exitCode, capture } = await call(["styles", "find", "--json"], root);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(capture.out);
    expect(parsed.outputVersion).toBe(1);
    expect(parsed.styles).toEqual(["src/styles/app.css", "src/styles/other.css"]);
    expect(parsed.nextStep).toContain("lexforge styles set");
  });

  it("find --json names a next step when the project has no CSS", async () => {
    const root = makeWorkspace({ "lexforge/config.yaml": CONFIG });
    roots.push(root);
    const { exitCode, capture } = await call(["styles", "find", "--json"], root);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(capture.out);
    expect(parsed.styles).toEqual([]);
    expect(parsed.nextStep.length).toBeGreaterThan(0);
  });

  it("set --json carries a next step without a placeholder", async () => {
    const root = workspace();
    const { exitCode, capture } = await call(["styles", "set", "src/styles/app.css", "--json"], root);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(capture.out);
    expect(parsed.styles).toEqual(["src/styles/app.css"]);
    expect(parsed.nextStep).not.toContain("<");
    expect(parsed.nextStep.length).toBeGreaterThan(0);
  });

  it("set replaces an empty ui key with a map", async () => {
    const root = makeWorkspace({
      "lexforge/config.yaml": "schema: spec-driven\nlanguage: en\nui:\n",
      "a.css": ".a {}\n",
    });
    roots.push(root);
    const { exitCode } = await call(["styles", "set", "a.css"], root);

    expect(exitCode).toBe(0);
    expect(config(root)).toContain("a.css");
  });

  it("set refuses an absolute path and a path outside the project", async () => {
    const root = workspace();

    for (const bad of [path.join(root, "src/styles/app.css"), "../outside.css"]) {
      const { exitCode, capture } = await call(["styles", "set", bad], root);

      expect(exitCode).toBe(2);
      expect(capture.err).toContain("not an existing CSS file");
      expect(config(root)).toBe(CONFIG);
    }
  });

  it("set writes ui.styles, replaces the list and keeps the rest of the config", async () => {
    const root = workspace();
    const first = await call(["styles", "set", "src/styles/app.css"], root);

    expect(first.exitCode).toBe(0);
    expect(config(root)).toContain("src/styles/app.css");
    expect(config(root)).toContain("context: Keep me.");

    const second = await call(["styles", "set", "src/styles/other.css"], root);

    expect(second.exitCode).toBe(0);
    expect(config(root)).toContain("src/styles/other.css");
    expect(config(root)).not.toContain("src/styles/app.css");
    expect(config(root)).toContain("context: Keep me.");
  });

  it("set refuses a missing path and a non-CSS path, naming it and leaving the config", async () => {
    const root = workspace();

    for (const bad of ["src/styles/gone.css", "src/readme.txt"]) {
      const { exitCode, capture } = await call(["styles", "set", bad], root);

      expect(exitCode).toBe(2);
      expect(capture.err).toContain(bad);
      expect(config(root)).toBe(CONFIG);
    }
  });
});
