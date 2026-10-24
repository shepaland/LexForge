import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readWorkflowFile } from "../../src/core/tasks/workflow-file.js";
import { createGitWorkspace, type GitWorkspace } from "../helpers/git-workspace.js";
import { cli } from "../helpers/plan-fixture.js";

let ws: GitWorkspace;
beforeEach(() => {
  ws = createGitWorkspace({
    "lexforge/config.yaml": "schema: spec-driven\nfile_limit:\n  lines: 400\nengineering:\n  stacks: []\n",
    "lexforge/changes/one/.lexforge.yaml": "schema: spec-driven\nlong_files: keep\n",
    "lexforge/changes/two/.lexforge.yaml": "schema: spec-driven\n",
  });
});
afterEach(() => ws.remove());

describe("lexforge migrate", () => {
  it("without --change carries the config and every change over", async () => {
    const result = await cli(ws.root, ["migrate"]);
    expect(result.exitCode).toBe(0);
    expect(result.json.data).toMatchObject({ config: { changed: true, removed: ["file_limit"] } });
    expect(result.json.data!.changes.map((item: { change: string }) => item.change)).toEqual(["one", "two"]);
    expect(readFileSync(path.join(ws.root, "lexforge/config.yaml"), "utf8")).not.toContain("file_limit");
    expect(readWorkflowFile(ws.root, "two").version).toBe(3);
  });

  it("with --change carries over only that change", async () => {
    const result = await cli(ws.root, ["migrate", "--change", "two"]);
    expect(result.exitCode).toBe(0);
    expect(result.json.data!.changes).toHaveLength(1);
    expect(readFileSync(path.join(ws.root, "lexforge/config.yaml"), "utf8")).toContain("file_limit");
    expect(() => readWorkflowFile(ws.root, "one")).toThrowError(
      expect.objectContaining({ code: "change-needs-migration" }),
    );
  });

  it("a second run answers already-migrated with exit code 2", async () => {
    await cli(ws.root, ["migrate"]);
    const again = await cli(ws.root, ["migrate"]);
    expect(again.exitCode).toBe(2);
    expect(again.json).toMatchObject({ error: { code: "already-migrated" }, nextStep: "lexforge status" });
    const one = await cli(ws.root, ["migrate", "--change", "one"]);
    expect(one.json).toMatchObject({ error: { code: "already-migrated" }, nextStep: "lexforge resume --change one" });
  });
});
