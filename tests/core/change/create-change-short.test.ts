import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../../src/cli/run.js";
import { createChange } from "../../../src/core/change/create-change.js";
import { readWorkflowFile, writeWorkflowFile } from "../../../src/core/tasks/workflow-file.js";
import { createCapture } from "../../helpers/capture.js";
import { createGitWorkspace, type GitWorkspace } from "../../helpers/git-workspace.js";

const created: GitWorkspace[] = [];

function workspace(): string {
  const made = createGitWorkspace({ "lexforge/config.yaml": "schema: spec-driven\nengineering:\n  stacks: []\n" });
  created.push(made);
  return made.root;
}

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

function workflowJson(root: string, name: string): string {
  return path.join(root, "lexforge/changes", name, "workflow.json");
}

describe("workflow.json version 3", () => {
  it("new change writes workflow 3 on the full path", () => {
    const root = workspace();
    createChange({ cwd: root, name: "add-search" });
    expect(readWorkflowFile(root, "add-search")).toEqual({ version: 3, schema: "spec-driven", schemaVersion: 1, path: "full" });
  });

  it("--short writes the short path", async () => {
    const root = workspace();
    const capture = createCapture();
    const exitCode = await run(["new", "change", "fix-typo", "--short", "--json"], { cwd: root, stdout: capture.stdout, stderr: capture.stderr });
    expect(exitCode).toBe(0);
    expect(readWorkflowFile(root, "fix-typo").path).toBe("short");
  });

  it("a workflow 2 change is refused with the migrate command", () => {
    const root = workspace();
    mkdirSync(path.join(root, "lexforge/changes/old"), { recursive: true });
    writeFileSync(workflowJson(root, "old"), JSON.stringify({ version: 2, schema: "spec-driven", schemaVersion: 1 }));
    expect(() => readWorkflowFile(root, "old")).toThrowError(
      expect.objectContaining({ code: "change-needs-migration", nextStep: "lexforge migrate --change old" }),
    );
  });

  it("writeWorkflowFile round-trips a switch to the full path", () => {
    const root = workspace();
    createChange({ cwd: root, name: "grow", short: true });
    writeWorkflowFile(root, "grow", { ...readWorkflowFile(root, "grow"), path: "full" });
    expect(readWorkflowFile(root, "grow").path).toBe("full");
  });
});
