import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { readDefectLedger, writeDefectLedger, type DefectEntry } from "../../src/core/defects/store.js";
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

/** Records one open defect and returns its identifier. */
async function recordOne(root: string): Promise<string> {
  const { capture } = await call(
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
      "--json",
    ],
    root,
  );
  const data = JSON.parse(capture.out) as { defect: { id: string } };
  return data.defect.id;
}

describe("lexforge defect close", () => {
  it("закрывает открытую запись: код 0, состояние closed, время закрытия, остальные поля прежние", async () => {
    const root = workspace().root;
    const id = await recordOne(root);
    const before = readDefectLedger(root).defects[0]!;

    const { exitCode } = await call(["defect", "close", id], root);

    expect(exitCode).toBe(0);

    const ledger = readDefectLedger(root);
    expect(ledger.defects).toHaveLength(1);
    const after = ledger.defects[0]!;

    expect(after.state).toBe("closed");
    expect(typeof after.closedAt).toBe("string");
    expect(new Date(after.closedAt!).toString()).not.toBe("Invalid Date");
    // Every field it was recorded with stays as it was.
    expect(after.id).toBe(before.id);
    expect(after.change).toBe(before.change);
    expect(after.level).toBe(before.level);
    expect(after.file).toBe(before.file);
    expect(after.line).toBe(before.line);
    expect(after.summary).toBe(before.summary);
    expect(after.recordedAt).toBe(before.recordedAt);
  });

  it("закрытие одной записи не трогает другую: она остаётся open со всеми полями", async () => {
    const root = workspace().root;

    const firstId = await recordOne(root);
    const { capture: secondCapture } = await call(
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
        "duplicated parser",
        "--json",
      ],
      root,
    );
    const secondId = (JSON.parse(secondCapture.out) as { defect: { id: string } }).defect.id;
    const untouchedBefore = readDefectLedger(root).defects.find((entry) => entry.id === secondId)!;

    const { exitCode } = await call(["defect", "close", firstId], root);

    expect(exitCode).toBe(0);

    const ledger = readDefectLedger(root);
    expect(ledger.defects).toHaveLength(2);

    const closed = ledger.defects.find((entry) => entry.id === firstId)!;
    expect(closed.state).toBe("closed");

    const untouched = ledger.defects.find((entry) => entry.id === secondId)!;
    expect(untouched.state).toBe("open");
    expect(untouched.closedAt).toBeUndefined();
    expect(untouched).toEqual(untouchedBefore);
  });

  it("неизвестный идентификатор — код 2, называет его", async () => {
    const root = workspace().root;
    await recordOne(root);

    const { exitCode, capture } = await call(["defect", "close", "nosuchid"], root);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("nosuchid");
    expect(capture.out).toBe("");
  });

  it("повторное закрытие той же записи — код 2, называет её состояние", async () => {
    const root = workspace().root;
    const id = await recordOne(root);
    await call(["defect", "close", id], root);

    const { exitCode, capture } = await call(["defect", "close", id], root);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain(id);
    expect(capture.err).toContain("closed");

    const ledger = readDefectLedger(root);
    expect(ledger.defects).toHaveLength(1);
    expect(ledger.defects[0]!.state).toBe("closed");
  });

  it("запись, закрытая без closedAt (правка вручную или конфликт), не пишет \"undefined\" в отказе", async () => {
    const root = workspace().root;
    const mangled: DefectEntry = {
      id: "11111111",
      change: CHANGE,
      level: "minor",
      file: "src/core/auth/session.ts",
      line: 1,
      summary: "closed by hand, no closedAt",
      state: "closed",
      recordedAt: "2026-08-30T09:12:44.281Z",
      // closedAt deliberately absent: the field is optional in the schema,
      // and a merge or a hand edit can leave a "closed" entry without one.
    };
    writeDefectLedger(root, { outputVersion: 1, defects: [mangled] });

    const { exitCode, capture } = await call(["defect", "close", "11111111"], root);

    expect(exitCode).toBe(2);
    expect(capture.err).not.toContain("undefined");
    expect(capture.err).not.toContain("(closed at )");
  });
});

describe("lexforge defect close: ответ --json", () => {
  it("несёт outputVersion, workspaceRoot, defect и nextStep, состояние defect — closed", async () => {
    const root = workspace().root;
    const id = await recordOne(root);

    const { exitCode, capture } = await call(["defect", "close", id, "--json"], root);
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
        closedAt: string;
      };
      nextStep: string;
    };

    expect(exitCode).toBe(0);
    expect(data.outputVersion).toBe(1);
    expect(typeof data.workspaceRoot).toBe("string");
    expect(data.defect.id).toMatch(/^[0-9a-f]{8}$/);
    expect(data.defect.id).toBe(id);
    expect(data.defect.change).toBe(CHANGE);
    expect(data.defect.state).toBe("closed");
    expect(new Date(data.defect.closedAt).toString()).not.toBe("Invalid Date");
    expect(typeof data.nextStep).toBe("string");
    expect(data.nextStep.length).toBeGreaterThan(0);
  });
});
