import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateChange, migrateConfig } from "../../../src/core/tasks/migrate.js";
import { readWorkflowFile } from "../../../src/core/tasks/workflow-file.js";
import { readProjectConfig } from "../../../src/core/workspace/project-config.js";
import { createGitWorkspace, type GitWorkspace } from "../../helpers/git-workspace.js";

const CONFIG = `schema: spec-driven
# keep me
file_limit:
  lines: 400
engineering:
  stacks: []
  disabled:
    tdd: "the owner said so"
`;

const PLAN = {
  version: 1,
  cycles: [
    {
      id: "search",
      tasks: ["1.1"],
      files: [{ path: "src/notes.js" }, { path: "test/notes.test.mjs" }],
      testFiles: ["test/notes.test.mjs"],
      command: "node --test test/notes.test.mjs",
      expectedFailure: "not ok 1 - search",
      acceptance: [{ id: "a1", task: "1.1", description: "search finds a note" }],
    },
  ],
};

const DIR = "lexforge/changes/demo";

let ws: GitWorkspace;
let changeDir: string;
beforeEach(() => {
  ws = createGitWorkspace({
    "lexforge/config.yaml": CONFIG,
    [`${DIR}/.lexforge.yaml`]: "schema: spec-driven\nlong_files: refactor\n",
    [`${DIR}/workflow.json`]: JSON.stringify({ version: 2, schema: "spec-driven", schemaVersion: 1 }),
    [`${DIR}/execution-plan.json`]: JSON.stringify(PLAN),
    [`${DIR}/execution/search/state.json`]: JSON.stringify({ cycle: "search" }),
  });
  changeDir = path.join(ws.root, DIR);
});
afterEach(() => ws.remove());

/** Every file under the directory with its content, so a test sees any write. */
function treeSnapshot(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const full = path.join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else files[path.relative(dir, full)] = readFileSync(full, "utf8");
    }
  };
  walk(dir);
  return files;
}

describe("migrateConfig", () => {
  it("removes file_limit from config.yaml and keeps the other keys and comments", () => {
    const configPath = path.join(ws.root, "lexforge/config.yaml");
    const without = CONFIG.replace("file_limit:\n  lines: 400\n", "");
    expect(migrateConfig(ws.root)).toEqual({ changed: true, removed: ["file_limit"] });
    const text = readFileSync(configPath, "utf8");
    expect(text).not.toContain("file_limit");
    expect(text).toContain("# keep me");
    expect(text).toBe(without);
    expect(readProjectConfig(ws.root).engineering).toEqual({ stacks: [], disabled: { tdd: "the owner said so" } });
  });

  it("leaves a config without old keys as it is", () => {
    migrateConfig(ws.root);
    const configPath = path.join(ws.root, "lexforge/config.yaml");
    const before = readFileSync(configPath, "utf8");
    expect(migrateConfig(ws.root)).toEqual({ changed: false, removed: [] });
    expect(readFileSync(configPath, "utf8")).toBe(before);
  });
});

describe("migrateChange", () => {
  it("removes long_files from .lexforge.yaml and writes workflow 3", () => {
    migrateChange(ws.root, "demo");
    expect(readFileSync(path.join(changeDir, ".lexforge.yaml"), "utf8")).toBe("schema: spec-driven\n");
    expect(readWorkflowFile(ws.root, "demo")).toEqual({
      version: 3,
      schema: "spec-driven",
      schemaVersion: 1,
      path: "full",
    });
  });

  it("a second run answers already-migrated and writes nothing", () => {
    migrateChange(ws.root, "demo");
    const snapshot = treeSnapshot(changeDir);
    expect(() => migrateChange(ws.root, "demo")).toThrowError(
      expect.objectContaining({ code: "already-migrated", nextStep: "lexforge resume --change demo" }),
    );
    expect(treeSnapshot(changeDir)).toEqual(snapshot);
  });

  it("moves execution/ aside to execution-5x/", () => {
    migrateChange(ws.root, "demo");
    expect(existsSync(path.join(changeDir, "execution"))).toBe(false);
    expect(existsSync(path.join(changeDir, "execution-plan.json"))).toBe(false);
    expect(existsSync(path.join(changeDir, "execution-5x/execution-plan.json"))).toBe(true);
    expect(existsSync(path.join(changeDir, "execution-5x/search/state.json"))).toBe(true);
  });

  it("refuses a change that does not exist", () => {
    expect(() => migrateChange(ws.root, "missing")).toThrowError(expect.objectContaining({ code: "change-not-found" }));
  });
});
