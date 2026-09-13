import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { createPlainWorkspace, type GitWorkspace } from "../helpers/git-workspace.js";

const CHANGE = "add-auth";
const OTHER_CHANGE = "fix-parser";

const CHANGE_FILES = {
  [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
  [`lexforge/changes/${CHANGE}/proposal.md`]: "## Why\n\nPasswords are stored in the open.\n",
  [`lexforge/changes/${OTHER_CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
  [`lexforge/changes/${OTHER_CHANGE}/proposal.md`]: "## Why\n\nThe parser is duplicated.\n",
};

const created: GitWorkspace[] = [];

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

function workspace(): GitWorkspace {
  const made = createPlainWorkspace(CHANGE_FILES);
  created.push(made);
  return made;
}

async function call(argv: string[], cwd: string) {
  const capture = createCapture();
  const exitCode = await run(argv, { cwd, stdout: capture.stdout, stderr: capture.stderr });
  return { exitCode, capture };
}

async function record(
  root: string,
  options: { change: string; level: string; file: string; line: string; summary: string },
): Promise<string> {
  const { capture } = await call(
    [
      "defect",
      "record",
      "--change",
      options.change,
      "--level",
      options.level,
      "--file",
      options.file,
      "--line",
      options.line,
      "--summary",
      options.summary,
      "--json",
    ],
    root,
  );
  return (JSON.parse(capture.out) as { defect: { id: string } }).defect.id;
}

describe("lexforge defect list: журнала ещё нет", () => {
  it("на пустом проекте без единого defects.json не отказывает, а печатает пусто и даёт код 0", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(["defect", "list"], root);

    expect(exitCode).toBe(0);
    expect(capture.err).toBe("");
  });
});

describe("lexforge defect list: человеческий вывод", () => {
  it("открытая и закрытая записи обе печатаются со всеми семью полями", async () => {
    const root = workspace().root;

    const openId = await record(root, {
      change: CHANGE,
      level: "important",
      file: "src/core/auth/session.ts",
      line: "42",
      summary: "session token not invalidated on logout",
    });
    const closedId = await record(root, {
      change: CHANGE,
      level: "minor",
      file: "src/core/auth/login.ts",
      line: "10",
      summary: "duplicated parser",
    });
    await call(["defect", "close", closedId], root);

    const { exitCode, capture } = await call(["defect", "list"], root);

    expect(exitCode).toBe(0);
    for (const id of [openId, closedId]) {
      expect(capture.out).toContain(id);
    }
    expect(capture.out).toContain(CHANGE);
    expect(capture.out).toContain("important");
    expect(capture.out).toContain("minor");
    // The composed fragment, not the bare number: an 8-character hex
    // identifier contains the digit pair "42" or "10" often enough that a
    // bare `toContain` would pass with the line number dropped entirely.
    expect(capture.out).toContain("src/core/auth/session.ts:42");
    expect(capture.out).toContain("src/core/auth/login.ts:10");
    expect(capture.out).toContain("session token not invalidated on logout");
    expect(capture.out).toContain("duplicated parser");
    expect(capture.out).toContain("open");
    expect(capture.out).toContain("closed");
  });

  it("без флагов список не сужается — команда не требует --change", async () => {
    const root = workspace().root;
    await record(root, {
      change: CHANGE,
      level: "minor",
      file: "src/core/auth/session.ts",
      line: "1",
      summary: "x",
    });
    await record(root, {
      change: OTHER_CHANGE,
      level: "minor",
      file: "src/core/parser.ts",
      line: "2",
      summary: "y",
    });

    const { exitCode, capture } = await call(["defect", "list"], root);

    expect(exitCode).toBe(0);
    expect(capture.out).toContain(CHANGE);
    expect(capture.out).toContain(OTHER_CHANGE);
  });

  it("--change сужает список до одного change", async () => {
    const root = workspace().root;
    const idInChange = await record(root, {
      change: CHANGE,
      level: "minor",
      file: "src/core/auth/session.ts",
      line: "1",
      summary: "only in add-auth",
    });
    const idInOther = await record(root, {
      change: OTHER_CHANGE,
      level: "minor",
      file: "src/core/parser.ts",
      line: "2",
      summary: "only in fix-parser",
    });

    const { exitCode, capture } = await call(["defect", "list", "--change", CHANGE], root);

    expect(exitCode).toBe(0);
    expect(capture.out).toContain(idInChange);
    expect(capture.out).not.toContain(idInOther);
  });

  it("--open сужает список до записей, ещё не закрытых", async () => {
    const root = workspace().root;
    const openId = await record(root, {
      change: CHANGE,
      level: "minor",
      file: "src/core/auth/session.ts",
      line: "1",
      summary: "still open",
    });
    const closedId = await record(root, {
      change: CHANGE,
      level: "minor",
      file: "src/core/auth/login.ts",
      line: "2",
      summary: "fixed already",
    });
    await call(["defect", "close", closedId], root);

    const { exitCode, capture } = await call(["defect", "list", "--open"], root);

    expect(exitCode).toBe(0);
    expect(capture.out).toContain(openId);
    expect(capture.out).not.toContain(closedId);
  });

  it("--change и --open вместе сужают до открытых записей одного change", async () => {
    const root = workspace().root;
    const openInChange = await record(root, {
      change: CHANGE,
      level: "minor",
      file: "src/core/auth/session.ts",
      line: "1",
      summary: "open in add-auth",
    });
    const closedInChange = await record(root, {
      change: CHANGE,
      level: "minor",
      file: "src/core/auth/login.ts",
      line: "2",
      summary: "closed in add-auth",
    });
    await call(["defect", "close", closedInChange], root);
    const openInOther = await record(root, {
      change: OTHER_CHANGE,
      level: "minor",
      file: "src/core/parser.ts",
      line: "3",
      summary: "open in fix-parser",
    });

    const { capture } = await call(
      ["defect", "list", "--change", CHANGE, "--open"],
      root,
    );

    expect(capture.out).toContain(openInChange);
    expect(capture.out).not.toContain(closedInChange);
    expect(capture.out).not.toContain(openInOther);
  });

  it("запись с переводом строки в summary печатается одной строкой", async () => {
    const root = workspace().root;
    await record(root, {
      change: CHANGE,
      level: "minor",
      file: "src/b.ts",
      line: "7",
      summary: "first line\nsecond line pretending to be another entry",
    });

    const { capture } = await call(["defect", "list"], root);
    // The entry has an open state, so `nextStep` prints its own "Next step:"
    // line too; that line is expected and is not part of the entry table.
    const lines = capture.out
      .trimEnd()
      .split("\n")
      .filter((line) => !line.startsWith("Next step:"));

    // One entry, one line: the second half of the summary must not stand on
    // its own line, where it would read as an entry with no identifier.
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("first line second line pretending to be another entry");
  });
});
