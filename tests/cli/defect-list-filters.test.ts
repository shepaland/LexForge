import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { readDefectLedger, writeDefectLedger, type DefectEntry } from "../../src/core/defects/store.js";
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

describe("lexforge defect list: пусто из-за фильтра, не из-за журнала", () => {
  it("--change на несуществующий change: «No defects in <change>.»", async () => {
    const root = workspace().root;
    await record(root, {
      change: CHANGE,
      level: "minor",
      file: "src/core/auth/session.ts",
      line: "1",
      summary: "x",
    });

    const { exitCode, capture } = await call(["defect", "list", "--change", "no-such-change"], root);

    expect(exitCode).toBe(0);
    expect(capture.out).toContain("No defects in no-such-change.");
  });

  it("--change --open, всё в этом change уже закрыто: «No open defects in <change>.»", async () => {
    const root = workspace().root;
    const id = await record(root, {
      change: CHANGE,
      level: "minor",
      file: "src/core/auth/session.ts",
      line: "1",
      summary: "x",
    });
    await call(["defect", "close", id], root);

    const { exitCode, capture } = await call(
      ["defect", "list", "--change", CHANGE, "--open"],
      root,
    );

    expect(exitCode).toBe(0);
    expect(capture.out).toContain(`No open defects in ${CHANGE}.`);
  });

  it("журнал действительно пуст: «No defects recorded yet.»", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(["defect", "list"], root);

    expect(exitCode).toBe(0);
    expect(capture.out).toContain("No defects recorded yet.");
  });
});

describe("lexforge defect list: --open фильтрует по state, не по наличию closedAt", () => {
  it("запись closed без closedAt (правка вручную) исключается флагом --open", async () => {
    const root = workspace().root;
    const openId = await record(root, {
      change: CHANGE,
      level: "minor",
      file: "src/core/auth/session.ts",
      line: "1",
      summary: "still open",
    });
    const mangled: DefectEntry = {
      id: "22222222",
      change: CHANGE,
      level: "minor",
      file: "src/core/auth/login.ts",
      line: 2,
      summary: "closed by hand, no closedAt",
      state: "closed",
      recordedAt: "2026-08-30T09:12:44.281Z",
      // closedAt deliberately absent, same as tests/cli/defect-close.test.ts's
      // mangled-entry case: the store allows this, and `--open` has to tell
      // it apart from an open entry by `state`, not by whether `closedAt` is set.
    };
    const ledger = readDefectLedger(root);
    writeDefectLedger(root, { outputVersion: 1, defects: [...ledger.defects, mangled] });

    const { capture } = await call(["defect", "list", "--open"], root);

    expect(capture.out).toContain(openId);
    expect(capture.out).not.toContain(mangled.id);
  });
});

describe("lexforge defect list: nextStep", () => {
  it("список содержит открытую запись — nextStep называет её закрытие", async () => {
    const root = workspace().root;
    const openId = await record(root, {
      change: CHANGE,
      level: "minor",
      file: "src/core/auth/session.ts",
      line: "1",
      summary: "x",
    });

    const { capture } = await call(["defect", "list", "--json"], root);
    const data = JSON.parse(capture.out) as { nextStep: string };

    expect(data.nextStep).toBe(`lexforge defect close ${openId}`);
  });

  it("ничего не найдено — nextStep пуст", async () => {
    const root = workspace().root;

    const { capture } = await call(["defect", "list", "--json"], root);
    const data = JSON.parse(capture.out) as { nextStep: string };

    expect(data.nextStep).toBe("");
  });

  it("в списке только закрытые записи — nextStep пуст", async () => {
    const root = workspace().root;
    const id = await record(root, {
      change: CHANGE,
      level: "minor",
      file: "src/core/auth/session.ts",
      line: "1",
      summary: "x",
    });
    await call(["defect", "close", id], root);

    const { capture } = await call(["defect", "list", "--json"], root);
    const data = JSON.parse(capture.out) as { nextStep: string };

    expect(data.nextStep).toBe("");
  });
});

describe("lexforge defect list: ответ --json", () => {
  it("несёт те же записи массивом", async () => {
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

    const { exitCode, capture } = await call(["defect", "list", "--json"], root);
    const data = JSON.parse(capture.out) as {
      outputVersion: number;
      defects: DefectEntry[];
    };

    expect(exitCode).toBe(0);
    expect(data.outputVersion).toBe(1);
    expect(Array.isArray(data.defects)).toBe(true);
    // Every field, not a hand-picked subset: `file`, `line` and `summary` are
    // exactly what a reader of this reply needs most, and section 9 feeds
    // `lexforge-verify` findings through this same reply.
    const onDisk = readDefectLedger(root).defects;
    expect(data.defects).toHaveLength(onDisk.length);
    const byId = (list: DefectEntry[]) => [...list].sort((a, b) => a.id.localeCompare(b.id));
    expect(byId(data.defects)).toEqual(byId(onDisk));
    expect(data.defects.map((entry) => entry.id).sort()).toEqual([closedId, openId].sort());
  });

  it("пустой журнал даёт пустой массив, а не отказ", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(["defect", "list", "--json"], root);
    const data = JSON.parse(capture.out) as { defects: unknown[] };

    expect(exitCode).toBe(0);
    expect(data.defects).toEqual([]);
  });
});
