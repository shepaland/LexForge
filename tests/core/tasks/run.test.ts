import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { classifyRed, runTaskCommand, type CommandRun } from "../../../src/core/tasks/run.js";
import { createGitWorkspace, type GitWorkspace } from "../../helpers/git-workspace.js";

let ws: GitWorkspace;
let ctx: { cwd: string; base: string; declaredFiles: string[] };

beforeAll(() => {
  ws = createGitWorkspace({ "src/app.js": "export const app = 1;\n" });
  ctx = { cwd: ws.root, base: ws.head, declaredFiles: [] };
});
afterAll(() => ws.remove());

function runOf(exitCode: number, tail: string): CommandRun {
  return { exitCode, tail, log: tail };
}

describe("classifyRed", () => {
  it("a failing assertion is red", () => {
    expect(classifyRed(runOf(1, "AssertionError: expected 2 to be 3"), ctx)).toEqual({ kind: "red" });
  });

  it("exit 0 is not red", () => expect(classifyRed(runOf(0, "ok"), ctx)).toEqual({ kind: "passed" }));

  it("a missing module the task declares as new is red", () => {
    expect(
      classifyRed(runOf(1, "Cannot find module '/w/src/search.js'"), { ...ctx, declaredFiles: ["src/search.js"] }),
    ).toEqual({ kind: "red" });
  });

  it("a missing package is broken and names worktree.setup", () => {
    expect(classifyRed(runOf(1, "Error: Cannot find module 'vitest'"), ctx)).toEqual({
      kind: "broken",
      reason: expect.stringContaining("worktree.setup"),
    });
  });

  it("a missing package reported by ESM is broken", () => {
    const out = "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'left-pad' imported from /w/test/a.mjs";
    expect(classifyRed(runOf(1, out), ctx).kind).toBe("broken");
  });

  it("a missing module that exists at the task base is broken", () => {
    expect(
      classifyRed(runOf(1, "Cannot find module '/w/src/app.js'"), { ...ctx, declaredFiles: ["src/app.js"] }).kind,
    ).toBe("broken");
    expect(classifyRed(runOf(1, "Cannot find module './app.js'"), { ...ctx, declaredFiles: ["src/app.js"] }).kind).toBe(
      "broken",
    );
  });

  it("a missing module the task does not declare is broken", () => {
    expect(classifyRed(runOf(1, "Cannot find module '/w/src/search.js'"), ctx).kind).toBe("broken");
  });

  it("command not found is broken", () =>
    expect(classifyRed(runOf(127, "sh: vitest: command not found"), ctx).kind).toBe("broken"));

  it("error TS naming a declared new file is red, naming another file is broken", () => {
    expect(
      classifyRed(runOf(2, "src/search.ts(1,1): error TS2307"), { ...ctx, declaredFiles: ["src/search.ts"] }).kind,
    ).toBe("red");
    expect(classifyRed(runOf(2, "src/app.ts(4,2): error TS2322"), ctx).kind).toBe("broken");
  });

  it("error TS in a test that cannot find a declared new module is red", () => {
    const out = "test/search.test.ts(1,24): error TS2307: Cannot find module '../src/search.js'";
    expect(classifyRed(runOf(2, out), { ...ctx, declaredFiles: ["src/search.js"] }).kind).toBe("red");
  });

  it("vitest naming a declared new module without extension, relative to its importer, is red", () => {
    const out = [
      "Error: Cannot find module '../src/search' imported from '/w/tests/search.test.ts'",
      "Caused by: Error: Failed to load url ../src/search (resolved id: ../src/search) in /w/tests/search.test.ts. Does the file exist?",
    ].join("\n");
    expect(classifyRed(runOf(1, out), { ...ctx, declaredFiles: ["src/search.ts", "tests/search.test.ts"] })).toEqual({
      kind: "red",
    });
  });

  it("TS2307 naming a declared .ts module by its .js specifier is red", () => {
    const out = "test/search.test.ts(1,24): error TS2307: Cannot find module '../src/search.js'";
    expect(classifyRed(runOf(2, out), { ...ctx, declaredFiles: ["src/search.ts"] })).toEqual({ kind: "red" });
  });

  it("a relative specifier resolves against its importer, so a module next to another file stays broken", () => {
    const out = "Error: Cannot find module './search.js' imported from '/w/tests/search.test.ts'";
    expect(classifyRed(runOf(1, out), { ...ctx, declaredFiles: ["src/search.ts"] }).kind).toBe("broken");
  });

  it("a declared module that exists at the base stays broken once resolved", () => {
    const out = "Error: Cannot find module './app.js' imported from '/w/src/index.js'";
    expect(classifyRed(runOf(1, out), { ...ctx, declaredFiles: ["src/app.js"] }).kind).toBe("broken");
    expect(classifyRed(runOf(1, out.replace("app", "fresh")), { ...ctx, declaredFiles: ["src/fresh.ts"] }).kind).toBe(
      "red",
    );
  });

  it("no test files found is broken", () =>
    expect(classifyRed(runOf(1, "No test files found"), ctx).kind).toBe("broken"));
});

describe("runTaskCommand", () => {
  it("runs through the shell and keeps both streams", () => {
    const run = runTaskCommand(ws.root, `node -e "console.log('out'); console.error('err'); process.exit(3)"`);
    expect(run.exitCode).toBe(3);
    expect(run.log).toContain("out");
    expect(run.log).toContain("err");
  });

  it("keeps the last 40 lines as the tail", () => {
    const run = runTaskCommand(ws.root, `node -e "for (let i = 1; i <= 50; i++) console.log('line' + i)"`);
    const lines = run.tail.split("\n");
    expect(lines).toHaveLength(40);
    expect(lines[0]).toBe("line11");
    expect(lines.at(-1)).toBe("line50");
  });
});
