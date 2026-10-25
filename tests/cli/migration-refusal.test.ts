import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
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

/** Every file under `dir`, sorted, so a run can be checked for leaving nothing behind. */
function filesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true }) as string[])
    .filter((rel) => statSync(path.join(dir, rel)).isFile())
    .sort();
}

/**
 * Runs a command of an unmigrated change and checks the three things a guard
 * owes: the refusal itself, and that nothing was read or written past it - no
 * file left in the change, and no lock left over either.
 */
async function assertRefused(argv: string[], root: string): Promise<void> {
  const before = filesIn(path.join(root, CHANGE_DIR));
  const { exitCode, json } = await call(argv, root);
  const after = filesIn(path.join(root, CHANGE_DIR));

  expect(exitCode).toBe(2);
  expect(json).toMatchObject(REFUSAL);
  expect(after).toEqual(before);
}

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

describe("the rest of the commands that read the state of a change also refuse it below workflow 3", () => {
  it("check evidence refuses before checking a single stamp", async () => {
    const root = unmigratedWorkspace();
    await assertRefused(["check", "evidence", "--change", CHANGE], root);
    removeWorkspace(root);
  });

  it("journal add refuses instead of writing an entry into journal.jsonl", async () => {
    const root = unmigratedWorkspace();
    await assertRefused(
      ["journal", "add", "--change", CHANGE, "--kind", "question", "--text", "may this ship?"],
      root,
    );
    removeWorkspace(root);
  });

  it("journal resolve refuses instead of closing an entry that is not there", async () => {
    const root = unmigratedWorkspace();
    await assertRefused(["journal", "resolve", "--change", CHANGE, "--id", "J1", "--note", "settled"], root);
    removeWorkspace(root);
  });

  it("journal session refuses instead of opening a session and expiring the last one", async () => {
    const root = unmigratedWorkspace();
    await assertRefused(["journal", "session", "--change", CHANGE], root);
    removeWorkspace(root);
  });

  it("plan review refuses instead of registering plan-check-failing", async () => {
    const root = unmigratedWorkspace();
    await assertRefused(
      ["plan", "review", "--change", CHANGE, "--angle", "specs", "--file", "/no/such/report.md"],
      root,
    );
    removeWorkspace(root);
  });

  it("plan approve refuses instead of approving a plan it never read", async () => {
    const root = unmigratedWorkspace();
    await assertRefused(["plan", "approve", "--change", CHANGE, "--quote", "да"], root);
    removeWorkspace(root);
  });

  it("plan amend refuses instead of recording an amendment of the plan", async () => {
    const root = unmigratedWorkspace();
    await assertRefused(["plan", "amend", "--change", CHANGE, "--quote", "да"], root);
    removeWorkspace(root);
  });

  it("plan escalate refuses instead of moving the change to the full path", async () => {
    const root = unmigratedWorkspace();
    await assertRefused(["plan", "escalate", "--change", CHANGE], root);
    removeWorkspace(root);
  });

  it("review final refuses instead of writing the final review package", async () => {
    const root = unmigratedWorkspace();
    await assertRefused(["review", "final", "--change", CHANGE], root);
    removeWorkspace(root);
  });

  it("task start refuses instead of opening a worktree and writing a brief", async () => {
    const root = unmigratedWorkspace();
    await assertRefused(["task", "start", "--change", CHANGE, "--task", "1.1", "--executor", "exec-1"], root);
    removeWorkspace(root);
  });

  it("task red refuses instead of running the task's command on the test commit", async () => {
    const root = unmigratedWorkspace();
    await assertRefused(["task", "red", "--change", CHANGE, "--task", "1.1"], root);
    removeWorkspace(root);
  });

  it("task green refuses instead of running the task's command on the implementation commit", async () => {
    const root = unmigratedWorkspace();
    await assertRefused(["task", "green", "--change", CHANGE, "--task", "1.1"], root);
    removeWorkspace(root);
  });

  it("task review refuses instead of registering a reviewer's report", async () => {
    const root = unmigratedWorkspace();
    await assertRefused(
      ["task", "review", "--change", CHANGE, "--task", "1.1", "--file", "/no/such/report.md"],
      root,
    );
    removeWorkspace(root);
  });

  it("task close refuses instead of merging the task into the change branch", async () => {
    const root = unmigratedWorkspace();
    await assertRefused(["task", "close", "--change", CHANGE, "--task", "1.1"], root);
    removeWorkspace(root);
  });

  it("task abandon refuses instead of removing the task's worktree and branch", async () => {
    const root = unmigratedWorkspace();
    await assertRefused(["task", "abandon", "--change", CHANGE, "--task", "1.1"], root);
    removeWorkspace(root);
  });
});

describe("the guard reads the workflow only after the change lock would otherwise create a directory", () => {
  it("task start on a change the workspace does not have keeps change-not-found and leaves no directory", async () => {
    const root = unmigratedWorkspace();
    const ghostDir = path.join(root, "lexforge/changes/ghost");
    const { exitCode, json } = await call(
      ["task", "start", "--change", "ghost", "--task", "1.1", "--executor", "exec-1"],
      root,
    );
    const ghostDirExists = existsSync(ghostDir);
    removeWorkspace(root);

    expect(exitCode).toBe(2);
    expect(json).toMatchObject({ error: { code: "change-not-found" } });
    expect(ghostDirExists).toBe(false);
  });

  it("plan escalate on a change the workspace does not have keeps change-not-found and leaves no directory", async () => {
    const root = unmigratedWorkspace();
    const ghostDir = path.join(root, "lexforge/changes/ghost");
    const { exitCode, json } = await call(["plan", "escalate", "--change", "ghost"], root);
    const ghostDirExists = existsSync(ghostDir);
    removeWorkspace(root);

    expect(exitCode).toBe(2);
    expect(json).toMatchObject({ error: { code: "change-not-found" } });
    expect(ghostDirExists).toBe(false);
  });
});

describe("a stale lock on an unmigrated change is still cleared by unlock, not refused", () => {
  it("unlock removes the lock of an unmigrated change instead of answering change-needs-migration", async () => {
    const root = unmigratedWorkspace();
    writeFileSync(
      path.join(root, CHANGE_DIR, "change.lock"),
      JSON.stringify({ pid: 999999999, startedAt: new Date().toISOString(), command: "task start" }),
    );
    const { exitCode, json } = await call(["unlock", "--change", CHANGE], root);
    removeWorkspace(root);

    expect(exitCode).toBe(0);
    expect(json).toMatchObject({ removed: true });
  });
});

describe("the workspace listing still shows a change below workflow 3 instead of refusing the whole listing", () => {
  it("status with no --change lists a workspace that holds a change of version 2", async () => {
    const root = unmigratedWorkspace();
    const { exitCode, json } = await call(["status"], root);
    removeWorkspace(root);

    expect(exitCode).toBe(0);
    expect(json.changes).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: CHANGE })]),
    );
  });
});
