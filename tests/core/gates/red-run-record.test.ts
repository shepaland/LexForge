import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import { recordRedRun } from "../../../src/core/gates/red-run-record.js";
import { readRedRuns } from "../../../src/core/gates/red-run-store.js";
import { readHead } from "../../../src/core/git/repository.js";
import { worktreeDigest } from "../../../src/core/git/worktree-digest.js";
import { createCapture } from "../../helpers/capture.js";
import { createGitWorkspace, type GitWorkspace } from "../../helpers/git-workspace.js";

const CHANGE = "add-auth";
const TASK = "2.3";

const CHANGE_FILES = {
  [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
  [`lexforge/changes/${CHANGE}/proposal.md`]: "## Why\n\nPasswords are stored in the open.\n",
  [`lexforge/changes/${CHANGE}/tasks.md`]:
    "## 1. Section\n\n- [ ] 2.3 Write the failing test. Check: `pytest tests/test_login.py`\n",
};

/** UTC, ISO 8601, to the millisecond: the form `Date.prototype.toISOString` gives. */
const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const created: GitWorkspace[] = [];

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

function gitWorkspace(): GitWorkspace {
  const workspace = createGitWorkspace(CHANGE_FILES);
  created.push(workspace);
  return workspace;
}

async function red(root: string, task: string, command: string) {
  const capture = createCapture();
  const result = await recordRedRun({
    cwd: root,
    change: CHANGE,
    task,
    command,
    stdout: capture.stdout,
    stderr: capture.stderr,
  });
  return { result, capture };
}

describe("recordRedRun: прогон записан", () => {
  it("команда с кодом 1 даёт запись с командой, кодом, коммитом и отпечатком дерева, код 0", async () => {
    const workspace = gitWorkspace();

    const { result } = await red(workspace.root, TASK, 'node -e "process.exit(1)"');

    expect(result.exitCode).toBe(0);
    expect(result.data.task).toBe(TASK);
    expect(result.data.record.command).toBe('node -e "process.exit(1)"');
    expect(result.data.record.exitCode).toBe(1);
    expect(result.data.record.startedAt).toMatch(UTC_ISO);
    expect(Number.isInteger(result.data.record.durationMs)).toBe(true);
    expect(result.data.record.head).toBe(readHead(workspace.root));
    expect(result.data.record.head).toBe(workspace.head);
    expect(result.data.record.worktreeDigest).toBe(worktreeDigest(workspace.root));

    const stored = readRedRuns(workspace.root, CHANGE).records[TASK];
    expect(stored).toEqual(result.data.record);
  });

  it("команда бежит из корня рабочего пространства", async () => {
    const workspace = gitWorkspace();

    const { result } = await red(
      workspace.root,
      TASK,
      'node -e "process.stdout.write(process.cwd()); process.exit(1)"',
    );

    expect(result.data.record.outputTail).toContain(workspace.root);
  });
});

/** Печатает триста пронумерованных строк, весь прогон далеко за 8 КБ, и падает. */
const THREE_HUNDRED_LINES =
  'node -e "for (let i = 1; i <= 300; i += 1) ' +
  "process.stdout.write(String(i) + ' ' + 'x'.repeat(60) + '\\n'); process.exit(1)\"";

function tailLines(tail: string): string[] {
  return tail === "" ? [] : tail.replace(/\n$/, "").split("\n");
}

describe("recordRedRun: хвост вывода ограничен как у штампа метки", () => {
  it("триста строк дают не больше ста строк и не больше 8192 байт с признаком усечения", async () => {
    const workspace = gitWorkspace();

    const { result } = await red(workspace.root, TASK, THREE_HUNDRED_LINES);

    expect(result.data.record.exitCode).toBe(1);
    expect(tailLines(result.data.record.outputTail).length).toBeLessThanOrEqual(100);
    expect(Buffer.byteLength(result.data.record.outputTail, "utf8")).toBeLessThanOrEqual(8192);
    expect(result.data.record.outputTruncated).toBe(true);
  });
});

describe("recordRedRun: прогон вернулся зелёным", () => {
  it("код 0 не пишет запись, отвечает кодом 1 и называет два законных хода", async () => {
    const workspace = gitWorkspace();

    const { result } = await red(workspace.root, TASK, 'node -e "process.exit(0)"');

    expect(result.exitCode).toBe(1);
    expect(readRedRuns(workspace.root, CHANGE).records[TASK]).toBeUndefined();
    const text = result.lines.join("\n");
    expect(text).toContain("green");
    expect(text).toContain("rewrite the test");
    expect(text).toContain("drop the task");
  });
});

function thrownBy(action: () => unknown): Promise<UsageError> {
  return action()
    .then(() => {
      throw new Error("the call was expected to fail and did not");
    })
    .catch((error: unknown) => {
      expect(error).toBeInstanceOf(UsageError);
      return error as UsageError;
    });
}

describe("recordRedRun: команда не запустилась", () => {
  it("несуществующий исполняемый файл даёт код 2, называет команду и не пишет запись", async () => {
    const workspace = gitWorkspace();

    const error = await thrownBy(() =>
      recordRedRun({
        cwd: workspace.root,
        change: CHANGE,
        task: TASK,
        command: "lexforge-no-such-binary-here --run",
        stdout: createCapture().stdout,
        stderr: createCapture().stderr,
      }),
    );

    expect(error.message).toContain("lexforge-no-such-binary-here");
    expect(readRedRuns(workspace.root, CHANGE).records[TASK]).toBeUndefined();
  });
});
