import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import { defectsFile, readDefectLedger, writeDefectLedger, type DefectEntry } from "../../../src/core/defects/store.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const LEDGER_PATH = "lexforge/defects.json";

const OPEN_ENTRY: DefectEntry = {
  id: "a1b2c3d4",
  change: "add-auth",
  level: "important",
  file: "src/core/auth/session.ts",
  line: 42,
  summary: "session token not invalidated on logout",
  state: "open",
  recordedAt: "2026-08-30T09:12:44.281Z",
};

const CLOSED_ENTRY: DefectEntry = {
  id: "e5f6a7b8",
  change: "add-auth",
  level: "minor",
  file: "src/core/auth/login.ts",
  line: 10,
  summary: "duplicated parser",
  state: "closed",
  recordedAt: "2026-08-29T09:12:44.281Z",
  closedAt: "2026-08-29T10:00:00.000Z",
};

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

function workspace(files: Record<string, string> = {}): string {
  const root = makeWorkspace({
    "lexforge/config.yaml": "schema: spec-driven\n",
    ...files,
  });
  created.push(root);
  return root;
}

function ledgerText(root: string): string {
  return readFileSync(path.join(root, LEDGER_PATH), "utf8");
}

describe("readDefectLedger и writeDefectLedger", () => {
  it("каталог без lexforge/defects.json даёт пустой список", () => {
    const root = workspace();

    expect(existsSync(defectsFile(root))).toBe(false);
    expect(readDefectLedger(root)).toEqual({ outputVersion: 1, defects: [] });
  });

  it("запись создаёт defects.json с версией формата и переданными записями", () => {
    const root = workspace();

    writeDefectLedger(root, { outputVersion: 1, defects: [OPEN_ENTRY, CLOSED_ENTRY] });

    expect(defectsFile(root)).toBe(path.join(root, LEDGER_PATH));
    expect(JSON.parse(ledgerText(root))).toEqual({
      outputVersion: 1,
      defects: [OPEN_ENTRY, CLOSED_ENTRY],
    });
  });

  it("повторное чтение возвращает записанные записи как есть", () => {
    const root = workspace();

    writeDefectLedger(root, { outputVersion: 1, defects: [OPEN_ENTRY, CLOSED_ENTRY] });

    expect(readDefectLedger(root)).toEqual({ outputVersion: 1, defects: [OPEN_ENTRY, CLOSED_ENTRY] });
  });
});

describe("writeDefectLedger: запись проецируется поле за полем", () => {
  it("чужое поле в записи не попадает в файл, а порядок полей не зависит от литерала", () => {
    const root = workspace();
    const withStrayField = {
      // Deliberately built with fields out of the canonical order, plus one
      // that is not part of `DefectEntry` at all.
      recordedAt: OPEN_ENTRY.recordedAt,
      state: OPEN_ENTRY.state,
      injected: "should not reach the file",
      id: OPEN_ENTRY.id,
      change: OPEN_ENTRY.change,
      level: OPEN_ENTRY.level,
      file: OPEN_ENTRY.file,
      line: OPEN_ENTRY.line,
      summary: OPEN_ENTRY.summary,
    } as unknown as DefectEntry;

    writeDefectLedger(root, { outputVersion: 1, defects: [withStrayField] });
    const text = ledgerText(root);

    expect(text).not.toContain("injected");
    const id = text.indexOf('"id"');
    const change = text.indexOf('"change"');
    const level = text.indexOf('"level"');
    const file = text.indexOf('"file"');
    const line = text.indexOf('"line"');
    const summary = text.indexOf('"summary"');
    const state = text.indexOf('"state"');
    const recordedAt = text.indexOf('"recordedAt"');
    expect(id).toBeLessThan(change);
    expect(change).toBeLessThan(level);
    expect(level).toBeLessThan(file);
    expect(file).toBeLessThan(line);
    expect(line).toBeLessThan(summary);
    expect(summary).toBeLessThan(state);
    expect(state).toBeLessThan(recordedAt);
  });

  it("повторная запись того же журнала даёт тот же текст байт в байт", () => {
    const root = workspace();

    writeDefectLedger(root, { outputVersion: 1, defects: [OPEN_ENTRY, CLOSED_ENTRY] });
    const first = ledgerText(root);

    writeDefectLedger(root, { outputVersion: 1, defects: [OPEN_ENTRY, CLOSED_ENTRY] });

    expect(ledgerText(root)).toBe(first);
  });
});

describe("readDefectLedger: ошибка чтения, не связанная с отсутствием файла", () => {
  it("каталог на месте файла не читается как пустой список", () => {
    const root = workspace();
    mkdirSync(path.join(root, LEDGER_PATH));

    expect(() => readDefectLedger(root)).toThrow();
    let thrown: unknown;
    try {
      readDefectLedger(root);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as NodeJS.ErrnoException).code).not.toBe("ENOENT");
  });
});

const CONFLICT = `{
  "outputVersion": 1,
  "defects": [
<<<<<<< HEAD
    { "id": "a1b2c3d4" }
=======
    { "id": "e5f6a7b8" }
>>>>>>> other
  ]
}
`;

const MISSING_DEFECTS = `{
  "outputVersion": 1
}
`;

const ENTRY_WITHOUT_STATE = `{
  "outputVersion": 1,
  "defects": [
    {
      "id": "a1b2c3d4",
      "change": "add-auth",
      "level": "important",
      "file": "src/core/auth/session.ts",
      "line": 42,
      "summary": "session token not invalidated on logout",
      "recordedAt": "2026-08-30T09:12:44.281Z"
    }
  ]
}
`;

function thrownBy(action: () => unknown): UsageError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(UsageError);
    return error as UsageError;
  }

  throw new Error("the call was expected to fail and did not");
}

describe("readDefectLedger: файл, который не читается как журнал", () => {
  it("следы конфликта слияния дают defect-ledger-broken с путём к файлу", () => {
    const root = workspace({ [LEDGER_PATH]: CONFLICT });

    const error = thrownBy(() => readDefectLedger(root));

    expect(error.code).toBe("defect-ledger-broken");
    expect(error.message).toContain(LEDGER_PATH);
  });

  it("файл без поля defects даёт ту же ошибку", () => {
    const root = workspace({ [LEDGER_PATH]: MISSING_DEFECTS });

    const error = thrownBy(() => readDefectLedger(root));

    expect(error.code).toBe("defect-ledger-broken");
    expect(error.message).toContain("defects");
  });

  it("запись без поля state даёт ту же ошибку и называет недостающее поле", () => {
    const root = workspace({ [LEDGER_PATH]: ENTRY_WITHOUT_STATE });

    const error = thrownBy(() => readDefectLedger(root));

    expect(error.code).toBe("defect-ledger-broken");
    expect(error.message).toContain("state");
  });
});
