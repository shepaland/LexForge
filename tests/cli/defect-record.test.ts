import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { createPlainWorkspace, type GitWorkspace } from "../helpers/git-workspace.js";

const CHANGE = "add-auth";

const CHANGE_FILES = {
  [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
  [`lexforge/changes/${CHANGE}/proposal.md`]: "## Why\n\nPasswords are stored in the open.\n",
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

describe("lexforge defect record: пять флагов", () => {
  it("без --file и --line даёт код 2 и называет оба флага", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(
      [
        "defect",
        "record",
        "--change",
        CHANGE,
        "--level",
        "minor",
        "--summary",
        "duplicated parser",
      ],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("--file");
    expect(capture.err).toContain("--line");
    expect(capture.out).toBe("");
  });

  it("--level blocker даёт код 2 и называет три допустимых уровня", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(
      [
        "defect",
        "record",
        "--change",
        CHANGE,
        "--level",
        "blocker",
        "--file",
        "src/core/auth/session.ts",
        "--line",
        "42",
        "--summary",
        "session token not invalidated on logout",
      ],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("critical");
    expect(capture.err).toContain("important");
    expect(capture.err).toContain("minor");
  });

  it("полный вызов записывает одну запись и даёт код 0", async () => {
    const root = workspace().root;

    const { exitCode } = await call(
      [
        "defect",
        "record",
        "--change",
        CHANGE,
        "--level",
        "important",
        "--file",
        "src/core/auth/session.ts",
        "--line",
        "42",
        "--summary",
        "session token not invalidated on logout",
      ],
      root,
    );

    expect(exitCode).toBe(0);

    const { readDefectLedger } = await import("../../src/core/defects/store.js");
    const ledger = readDefectLedger(root);
    expect(ledger.defects).toHaveLength(1);
    expect(ledger.defects[0]).toMatchObject({
      change: CHANGE,
      level: "important",
      file: "src/core/auth/session.ts",
      line: 42,
      summary: "session token not invalidated on logout",
      state: "open",
    });
    // The requirement names eight fields an entry SHALL carry. The six above
    // are trivially copied from the flags; `id` and `recordedAt` are the two
    // the command itself computes, and nothing else in this file would
    // notice if either stopped being written.
    expect(ledger.defects[0]!.id).toMatch(/^[0-9a-f]{8}$/);
    expect(new Date(ledger.defects[0]!.recordedAt).toString()).not.toBe("Invalid Date");
  });

  it("без --change даёт код 2 через отказ commander, не assertPresent", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(
      [
        "defect",
        "record",
        "--level",
        "minor",
        "--file",
        "src/core/auth/session.ts",
        "--line",
        "42",
        "--summary",
        "duplicated parser",
      ],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.out).toBe("");
    expect(capture.err).toContain("required option '--change <name>' not specified");
  });

  it.each(["abc", "0", "-3", "4.9", "1e3", "42abc", "  7  "])(
    "--line %s не число из одних цифр — код 2, называет --line",
    async (line) => {
      const root = workspace().root;

      const { exitCode, capture } = await call(
        [
          "defect",
          "record",
          "--change",
          CHANGE,
          "--level",
          "minor",
          "--file",
          "src/core/auth/session.ts",
          "--line",
          line,
          "--summary",
          "duplicated parser",
        ],
        root,
      );

      expect(exitCode).toBe(2);
      expect(capture.err).toContain("--line");
      expect(capture.out).toBe("");

      const { readDefectLedger } = await import("../../src/core/defects/store.js");
      expect(readDefectLedger(root).defects).toHaveLength(0);
    },
  );

  it("9007199254740993 превышает безопасный целый диапазон — код 2, называет --line", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(
      [
        "defect",
        "record",
        "--change",
        CHANGE,
        "--level",
        "minor",
        "--file",
        "src/core/auth/session.ts",
        "--line",
        "9007199254740993",
        "--summary",
        "duplicated parser",
      ],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("--line");
  });

  it("change, которого нет, сообщается раньше нехватки флагов", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(
      ["defect", "record", "--change", "no-such-change", "--level", "minor"],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.err).toContain('there is no change named "no-such-change"');
    // The change is reported and the call stops there: a call that is both
    // wrong-change and missing flags never reaches `assertPresent`.
    expect(capture.err).not.toContain("--level");
    expect(capture.err).not.toContain("--file");
  });
});
