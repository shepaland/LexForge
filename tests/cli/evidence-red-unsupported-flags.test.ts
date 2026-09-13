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

async function call(argv: string[], cwd: string) {
  const capture = createCapture();
  const exitCode = await run(argv, { cwd, stdout: capture.stdout, stderr: capture.stderr });
  return { exitCode, capture };
}

describe("lexforge evidence red: флаги, которых команда не берёт", () => {
  it("флаг --exit-code не поддерживается и даёт код 2", async () => {
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
        "--exit-code",
        "1",
      ],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("--exit-code");
    expect(capture.out).toBe("");
  });

  it("флаг --failing-line не поддерживается и даёт код 2", async () => {
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
        "--failing-line",
        "AssertionError: boom",
      ],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("--failing-line");
    expect(capture.out).toBe("");
  });

  it("флаг --output-tail не поддерживается и даёт код 2", async () => {
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
        "--output-tail",
        "boom",
      ],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("--output-tail");
    expect(capture.out).toBe("");
  });

  it("лишний позиционный аргумент даёт код 2", async () => {
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
        "--",
        "true",
      ],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.out).toBe("");
  });
});
