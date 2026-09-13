import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { createGitWorkspace, type GitWorkspace } from "../helpers/git-workspace.js";

const CHANGE = "add-auth";

const CHANGE_FILES = {
  [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
  [`lexforge/changes/${CHANGE}/proposal.md`]: "## Why\n\nPasswords are stored in the open.\n",
  [`lexforge/changes/${CHANGE}/tasks.md`]:
    "## 1. Section\n\n" +
    '- [ ] 2.3 Write the failing test. Check: `pytest tests/test_login.py`\n' +
    "- [ ] 2.4 Implement it. Check: `pytest tests/test_login.py`\n",
};

/** A plan written as an index: the section's tasks live in a file of their own. */
const INDEX_CHANGE_FILES = {
  [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
  [`lexforge/changes/${CHANGE}/proposal.md`]: "## Why\n\nPasswords are stored in the open.\n",
  [`lexforge/changes/${CHANGE}/tasks.md`]: "## 1. Section\n\n`tasks/01-section.md`\n",
  [`lexforge/changes/${CHANGE}/tasks/01-section.md`]:
    "Depends on: none\n\n" +
    '- [ ] 2.3 Write the failing test. Check: `pytest tests/test_login.py`\n' +
    "- [ ] 2.4 Implement it. Check: `pytest tests/test_login.py`\n",
};

const created: GitWorkspace[] = [];

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

function workspace(): GitWorkspace {
  const made = createGitWorkspace(CHANGE_FILES);
  created.push(made);
  return made;
}

/** A change whose plan is an index, its one section linked to a file of its own. */
function indexWorkspace(): GitWorkspace {
  const made = createGitWorkspace(INDEX_CHANGE_FILES);
  created.push(made);
  return made;
}

/** A change with no `tasks.md` at all: the plan is not written yet. */
function workspaceWithoutPlan(): GitWorkspace {
  const made = createGitWorkspace({
    [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
    [`lexforge/changes/${CHANGE}/proposal.md`]: "## Why\n\nPasswords are stored in the open.\n",
  });
  created.push(made);
  return made;
}

async function call(argv: string[], cwd: string) {
  const capture = createCapture();
  const exitCode = await run(argv, { cwd, stdout: capture.stdout, stderr: capture.stderr });
  return { exitCode, capture };
}

describe("lexforge evidence red", () => {
  it("команда с кодом 1 записывается и даёт код 0, --json несёт запись", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(
      [
        "evidence",
        "red",
        "--change",
        CHANGE,
        "--task",
        "2.3",
        "--command",
        'node -e "process.exit(1)"',
        "--json",
      ],
      root,
    );
    const data = JSON.parse(capture.out) as {
      outputVersion: number;
      change: string;
      task: string;
      record: { command: string; exitCode: number; head: string };
    };

    expect(exitCode).toBe(0);
    expect(data.outputVersion).toBe(1);
    expect(data.change).toBe(CHANGE);
    expect(data.task).toBe("2.3");
    expect(data.record.command).toBe('node -e "process.exit(1)"');
    expect(data.record.exitCode).toBe(1);
    expect(data.record.head).toMatch(/^[0-9a-f]{40}$/);
  });

  it("задача, которой план не несёт, даёт код 2 и перечисляет задачи плана", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(
      [
        "evidence",
        "red",
        "--change",
        CHANGE,
        "--task",
        "9.1",
        "--command",
        'node -e "process.exit(1)"',
      ],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("9.1");
    expect(capture.err).toContain("2.3");
    expect(capture.err).toContain("2.4");
    expect(capture.out).toBe("");
  });

  it("план ещё не написан: код 2 и сообщение, что задач в плане пока нет", async () => {
    const root = workspaceWithoutPlan().root;

    const { exitCode, capture } = await call(
      [
        "evidence",
        "red",
        "--change",
        CHANGE,
        "--task",
        "2.3",
        "--command",
        'node -e "process.exit(1)"',
      ],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("holds no task ids yet");
    expect(capture.out).toBe("");
  });

  it("зелёный прогон не пишет запись, даёт код 1 и называет два законных хода", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(
      [
        "evidence",
        "red",
        "--change",
        CHANGE,
        "--task",
        "2.3",
        "--command",
        'node -e "process.exit(0)"',
        "--json",
      ],
      root,
    );
    const data = JSON.parse(capture.out) as { record?: unknown; task: string };

    expect(exitCode).toBe(1);
    expect(data.record).toBeUndefined();
    expect(data.task).toBe("2.3");
  });

  it("несуществующая команда даёт код 2 и называет её", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(
      [
        "evidence",
        "red",
        "--change",
        CHANGE,
        "--task",
        "2.3",
        "--command",
        "lexforge-no-such-binary-here --run",
      ],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("lexforge-no-such-binary-here");
    expect(capture.out).toBe("");
  });

  it("вызов без --task даёт код 2", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(
      ["evidence", "red", "--change", CHANGE, "--command", 'node -e "process.exit(1)"'],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.out).toBe("");
  });

  it("вызов без --command даёт код 2", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(
      ["evidence", "red", "--change", CHANGE, "--task", "2.3"],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.out).toBe("");
  });

  it("план как индекс: задача из файла раздела известна, запись проходит с кодом 0", async () => {
    const root = indexWorkspace().root;

    const { exitCode, capture } = await call(
      [
        "evidence",
        "red",
        "--change",
        CHANGE,
        "--task",
        "2.3",
        "--command",
        'node -e "process.exit(1)"',
        "--json",
      ],
      root,
    );
    const data = JSON.parse(capture.out) as { task: string; record: { exitCode: number } };

    expect(exitCode).toBe(0);
    expect(data.task).toBe("2.3");
    expect(data.record.exitCode).toBe(1);
  });
});
