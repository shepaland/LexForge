import { randomBytes } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { createPlainWorkspace, type GitWorkspace } from "../helpers/git-workspace.js";

// Wraps the real implementation by default, so every test but the collision
// test below gets genuine random bytes. `mockImplementationOnce` queues are
// consumed in call order and left empty at the end of that one test, so
// nothing leaks into the tests that run after it.
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomBytes: vi.fn(actual.randomBytes) };
});

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

describe("lexforge defect record: повтор идентификатора", () => {
  it("столкновение внутри mutateLedger повторяется и второй записи достаётся другой id", async () => {
    const root = workspace().root;
    const mocked = vi.mocked(randomBytes);
    // The mock's call history is not per-test: every earlier test in this
    // file that recorded a defect for real added to it. Clear it here so
    // the count below is this test's own three calls, not the whole file's.
    mocked.mockClear();

    // First call: forced to "aaaaaaaa".
    mocked.mockImplementationOnce(() => Buffer.from("aaaaaaaa", "hex") as never);
    const first = await call(
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
        "1",
        "--summary",
        "first",
        "--json",
      ],
      root,
    );

    // Second call: the first draw collides with the entry already in the
    // ledger, `freshIdentifier`'s retry draws again and gets "bbbbbbbb".
    mocked.mockImplementationOnce(() => Buffer.from("aaaaaaaa", "hex") as never);
    mocked.mockImplementationOnce(() => Buffer.from("bbbbbbbb", "hex") as never);
    const second = await call(
      [
        "defect",
        "record",
        "--change",
        CHANGE,
        "--level",
        "minor",
        "--file",
        "src/core/auth/login.ts",
        "--line",
        "2",
        "--summary",
        "second",
        "--json",
      ],
      root,
    );

    const firstData = JSON.parse(first.capture.out) as { defect: { id: string } };
    const secondData = JSON.parse(second.capture.out) as { defect: { id: string } };

    expect(firstData.defect.id).toBe("aaaaaaaa");
    expect(secondData.defect.id).toBe("bbbbbbbb");
    expect(mocked).toHaveBeenCalledTimes(3);
  });
});

describe("lexforge defect record: ответ --json", () => {
  it("несёт outputVersion, workspaceRoot, defect и nextStep, состояние defect — open", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(
      [
        "defect",
        "record",
        "--change",
        CHANGE,
        "--level",
        "critical",
        "--file",
        "src/core/auth/session.ts",
        "--line",
        "42",
        "--summary",
        "session token not invalidated on logout",
        "--json",
      ],
      root,
    );
    const data = JSON.parse(capture.out) as {
      outputVersion: number;
      workspaceRoot: string;
      defect: {
        id: string;
        change: string;
        level: string;
        file: string;
        line: number;
        summary: string;
        state: string;
        recordedAt: string;
      };
      nextStep: string;
    };

    expect(exitCode).toBe(0);
    expect(data.outputVersion).toBe(1);
    expect(typeof data.workspaceRoot).toBe("string");
    // Decision 2 fixes the identifier at eight hexadecimal characters, not
    // any string: `expect.any(String)` would pass for `""`.
    expect(data.defect.id).toMatch(/^[0-9a-f]{8}$/);
    expect(data.defect.change).toBe(CHANGE);
    expect(data.defect.level).toBe("critical");
    expect(data.defect.file).toBe("src/core/auth/session.ts");
    expect(data.defect.line).toBe(42);
    expect(data.defect.summary).toBe("session token not invalidated on logout");
    expect(data.defect.state).toBe("open");
    expect(new Date(data.defect.recordedAt).toString()).not.toBe("Invalid Date");
    expect(typeof data.nextStep).toBe("string");
    expect(data.nextStep.length).toBeGreaterThan(0);
  });

  it("два вызова в одном change дают две разные записи с разными идентификаторами", async () => {
    const root = workspace().root;

    const first = await call(
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
        "42",
        "--summary",
        "duplicated parser",
        "--json",
      ],
      root,
    );
    const second = await call(
      [
        "defect",
        "record",
        "--change",
        CHANGE,
        "--level",
        "minor",
        "--file",
        "src/core/auth/login.ts",
        "--line",
        "10",
        "--summary",
        "another duplicated parser",
        "--json",
      ],
      root,
    );

    const firstData = JSON.parse(first.capture.out) as { defect: { id: string } };
    const secondData = JSON.parse(second.capture.out) as { defect: { id: string } };

    expect(firstData.defect.id).not.toBe(secondData.defect.id);

    const { readDefectLedger } = await import("../../src/core/defects/store.js");
    expect(readDefectLedger(root).defects).toHaveLength(2);
  });
});

describe("lexforge defect record: --change должен быть именем change, а не путём к нему", () => {
  // `readChangeConfig` resolves the directory through `path.join`, which
  // quietly normalizes a trailing slash or a trailing `/.`, and on a
  // case-insensitive filesystem resolves a different case too. The change
  // name is then stored verbatim in the entry, and `defectFindings` matches
  // it against `--change <name>` by exact string — so an entry recorded
  // under any of these spellings is invisible to both `verify` and `archive`
  // for the change it was actually meant to name.
  it.each(["add-auth/", "add-auth/.", "Add-Auth"])(
    "--change %s даёт код 2, а не тихо записывает под непойманным именем",
    async (spelling) => {
      const root = workspace().root;

      const { exitCode, capture } = await call(
        [
          "defect",
          "record",
          "--change",
          spelling,
          "--level",
          "critical",
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
      expect(capture.out).toBe("");

      const { readDefectLedger } = await import("../../src/core/defects/store.js");
      expect(readDefectLedger(root).defects).toHaveLength(0);
    },
  );
});
