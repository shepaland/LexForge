import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGitWorkspace, type GitWorkspace } from "../helpers/git-workspace.js";
import { cli } from "../helpers/plan-fixture.js";

let ws: GitWorkspace;
beforeEach(() => {
  ws = createGitWorkspace({ "lexforge/config.yaml": "schema: spec-driven\n" });
});
afterEach(() => ws.remove());

describe("the commands of the 5.x execution engine are gone", () => {
  it.each([[["cycle", "start"]], [["context"]], [["workflow", "migrate"]], [["evidence", "red"]]])(
    "%j is no longer a command",
    async (words) => {
      const result = await cli(ws.root, [...words, "--change", "demo"]);
      expect(result.exitCode).toBe(2);
      expect(result.json).toMatchObject({ error: { code: "unknown-command" } });
    },
  );

  it("no source file imports core/execution", () => {
    const grep = spawnSync("git", ["grep", "-l", "-e", "core/execution", "-e", "\\.\\./execution/", "--", "src"], {
      encoding: "utf8",
    });
    expect(grep.stdout.trim()).toBe("");
  });
});
