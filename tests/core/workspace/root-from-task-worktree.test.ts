import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findWorkspaceRoot } from "../../../src/core/workspace/find-root.js";
import { type GitWorkspace, writeAt } from "../../helpers/git-workspace.js";
import { createTaskWorkspace, taskSteps } from "../../helpers/task-workspace.js";

let ws: GitWorkspace | undefined;
let links: string | undefined;
afterEach(() => {
  ws?.remove();
  if (links !== undefined) rmSync(links, { recursive: true, force: true });
  links = undefined;
});

describe("findWorkspaceRoot inside a task worktree", () => {
  it("a command run inside a task worktree resolves the main worktree as root", async () => {
    ws = createTaskWorkspace();
    expect((await taskSteps(ws.root).start("1.1")).exitCode).toBe(0);
    expect(findWorkspaceRoot(path.join(ws.root, ".lexforge/worktrees/demo/1.1/src"))).toBe(ws.root);
  });

  it("a task worktree reached through a symlink still resolves the main worktree", async () => {
    ws = createTaskWorkspace();
    expect((await taskSteps(ws.root).start("1.1")).exitCode).toBe(0);
    links = mkdtempSync(path.join(tmpdir(), "lexforge-link-"));
    const link = path.join(links, "task");
    symlinkSync(path.join(ws.root, ".lexforge/worktrees/demo/1.1"), link);
    expect(findWorkspaceRoot(path.join(link, "src"))).toBe(ws.root);
  });

  it("a nested project inside a task worktree keeps its own workspace", async () => {
    ws = createTaskWorkspace();
    const steps = taskSteps(ws.root);
    expect((await steps.start("1.1")).exitCode).toBe(0);
    const wt = steps.wt("1.1");
    const nested = path.join(wt, "examples/notes");
    writeAt(wt, "examples/notes/lexforge/config.yaml", "schema: spec-driven\nengineering:\n  stacks: []\n");
    expect(findWorkspaceRoot(path.join(nested, "src"))).toBe(nested);
  });
});
