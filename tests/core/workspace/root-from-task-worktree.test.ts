import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findWorkspaceRoot } from "../../../src/core/workspace/find-root.js";
import { type GitWorkspace } from "../../helpers/git-workspace.js";
import { createTaskWorkspace, taskSteps } from "../../helpers/task-workspace.js";

let ws: GitWorkspace | undefined;
afterEach(() => ws?.remove());

describe("findWorkspaceRoot inside a task worktree", () => {
  it("a command run inside a task worktree resolves the main worktree as root", async () => {
    ws = createTaskWorkspace();
    expect((await taskSteps(ws.root).start("1.1")).exitCode).toBe(0);
    expect(findWorkspaceRoot(path.join(ws.root, ".lexforge/worktrees/demo/1.1/src"))).toBe(ws.root);
  });
});
