import { describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const CHANGE = "add-auth";
const CHANGE_DIR = `lexforge/changes/${CHANGE}`;

/** A change whose workflow.json predates version 3, laid out with no git repository. */
function unmigratedWorkspace(): string {
  return makeWorkspace({
    "lexforge/config.yaml": 'schema: spec-driven\nverification:\n  tests: node -e "process.exit(0)"\n',
    [`${CHANGE_DIR}/.lexforge.yaml`]: "schema: spec-driven\n",
    [`${CHANGE_DIR}/workflow.json`]: JSON.stringify({ version: 2, schema: "spec-driven", schemaVersion: 1 }),
  });
}

async function call(argv: string[], cwd: string): Promise<{ exitCode: number; json: Record<string, unknown> }> {
  const capture = createCapture();
  const exitCode = await run([...argv, "--json"], { cwd, stdout: capture.stdout, stderr: capture.stderr });
  const json = capture.out.trim() === "" ? {} : JSON.parse(capture.out);
  return { exitCode, json };
}

const REFUSAL = {
  error: { code: "change-needs-migration" },
  nextStep: `lexforge migrate --change ${CHANGE}`,
};

describe("every command of a change below workflow 3 refuses with change-needs-migration", () => {
  it("status refuses instead of counting progress with pre-6.0.0 semantics", async () => {
    const root = unmigratedWorkspace();
    const { exitCode, json } = await call(["status", "--change", CHANGE], root);
    removeWorkspace(root);

    expect(exitCode).toBe(2);
    expect(json).toMatchObject(REFUSAL);
  });

  it("check plan refuses instead of a wall of task-missing-* findings", async () => {
    const root = unmigratedWorkspace();
    const { exitCode, json } = await call(["check", "plan", "--change", CHANGE], root);
    removeWorkspace(root);

    expect(exitCode).toBe(2);
    expect(json).toMatchObject(REFUSAL);
  });

  it("validate refuses before reading the artifacts of the change", async () => {
    const root = unmigratedWorkspace();
    const { exitCode, json } = await call(["validate", CHANGE], root);
    removeWorkspace(root);

    expect(exitCode).toBe(2);
    expect(json).toMatchObject(REFUSAL);
  });

  it("instructions refuses before building the instruction of an artifact", async () => {
    const root = unmigratedWorkspace();
    const { exitCode, json } = await call(["instructions", "proposal", "--change", CHANGE], root);
    removeWorkspace(root);

    expect(exitCode).toBe(2);
    expect(json).toMatchObject(REFUSAL);
  });

  it("evidence record refuses before running the labelled command", async () => {
    const root = unmigratedWorkspace();
    const { exitCode, json } = await call(
      ["evidence", "record", "--change", CHANGE, "--label", "tests"],
      root,
    );
    removeWorkspace(root);

    expect(exitCode).toBe(2);
    expect(json).toMatchObject(REFUSAL);
  });

  it("a change name the workspace does not have keeps change-not-found", async () => {
    const root = unmigratedWorkspace();
    const { exitCode, json } = await call(["status", "--change", "ghost"], root);
    removeWorkspace(root);

    expect(exitCode).toBe(2);
    expect(json).toMatchObject({ error: { code: "change-not-found" } });
  });
});
