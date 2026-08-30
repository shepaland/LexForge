import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import {
  evidenceFile,
  putRecord,
  readLedger,
  writeLedger,
  type EvidenceRecord,
} from "../../../src/core/gates/evidence-store.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const CHANGE = "add-auth";
const LEDGER_PATH = `lexforge/changes/${CHANGE}/evidence.json`;

const TESTS: EvidenceRecord = {
  command: "npm test",
  exitCode: 0,
  startedAt: "2026-08-30T09:12:44.281Z",
  durationMs: 3140,
  head: "9f1c0b7a4e1d2c3b5a6f7e8d9c0b1a2f3e4d5c6b",
  worktreeDigest: "sha256:1f0a",
  outputTail: "1 passed",
  outputTruncated: false,
};

const LINT: EvidenceRecord = {
  ...TESTS,
  command: "npm run lint",
  startedAt: "2026-08-30T09:14:01.000Z",
  durationMs: 900,
  outputTail: "no problems",
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
    [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
    ...files,
  });
  created.push(root);
  return root;
}

function ledgerText(root: string): string {
  return readFileSync(path.join(root, LEDGER_PATH), "utf8");
}

describe("readLedger и writeLedger", () => {
  it("каталог без файла даёт пустой журнал", () => {
    const root = workspace();

    expect(existsSync(evidenceFile(root, CHANGE))).toBe(false);
    expect(readLedger(root, CHANGE)).toEqual({ outputVersion: 1, records: {} });
  });

  it("запись создаёт evidence.json с версией формата и одной записью", () => {
    const root = workspace();

    writeLedger(root, CHANGE, { outputVersion: 1, records: { tests: TESTS } });

    expect(evidenceFile(root, CHANGE)).toBe(path.join(root, LEDGER_PATH));
    expect(JSON.parse(ledgerText(root))).toEqual({
      outputVersion: 1,
      records: { tests: TESTS },
    });
    expect(readLedger(root, CHANGE)).toEqual({ outputVersion: 1, records: { tests: TESTS } });
  });
});

describe("writeLedger: текст файла постоянен", () => {
  it("метки отсортированы, отступ два пробела, файл кончается переводом строки", () => {
    const root = workspace();

    writeLedger(root, CHANGE, {
      outputVersion: 1,
      records: { tests: TESTS, build: LINT, lint: LINT },
    });
    const text = ledgerText(root);

    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain('\n  "records": {\n');
    expect(text.indexOf('"build"')).toBeLessThan(text.indexOf('"lint"'));
    expect(text.indexOf('"lint"')).toBeLessThan(text.indexOf('"tests"'));
  });

  it("повторная запись того же журнала даёт тот же текст байт в байт", () => {
    const root = workspace();

    writeLedger(root, CHANGE, { outputVersion: 1, records: { tests: TESTS, lint: LINT } });
    const first = ledgerText(root);

    writeLedger(root, CHANGE, { outputVersion: 1, records: { lint: LINT, tests: TESTS } });

    expect(ledgerText(root)).toBe(first);
  });
});

describe("putRecord: соседние метки", () => {
  it("запись lint оставляет запись tests прежней и растит число записей на единицу", () => {
    const root = workspace();

    const afterTests = putRecord(root, CHANGE, "tests", TESTS);
    expect(Object.keys(afterTests.records)).toEqual(["tests"]);

    const afterLint = putRecord(root, CHANGE, "lint", LINT);

    expect(Object.keys(afterLint.records).sort()).toEqual(["lint", "tests"]);
    expect(afterLint.records.tests).toEqual(TESTS);
    expect(readLedger(root, CHANGE).records.tests).toEqual(TESTS);
  });

  it("повторная запись метки заменяет её целиком и число записей не меняет", () => {
    const root = workspace();
    putRecord(root, CHANGE, "tests", TESTS);

    const again = putRecord(root, CHANGE, "tests", { ...TESTS, exitCode: 1, durationMs: 12 });

    expect(Object.keys(again.records)).toEqual(["tests"]);
    expect(again.records.tests).toEqual({ ...TESTS, exitCode: 1, durationMs: 12 });
  });
});

const CONFLICT = `{
  "outputVersion": 1,
  "records": {
<<<<<<< HEAD
    "tests": { "exitCode": 0 }
=======
    "tests": { "exitCode": 1 }
>>>>>>> other
  }
}
`;

const WITHOUT_EXIT_CODE = `{
  "outputVersion": 1,
  "records": {
    "tests": {
      "command": "npm test",
      "startedAt": "2026-08-30T09:12:44.281Z",
      "durationMs": 3140,
      "head": "9f1c0b7a4e1d2c3b5a6f7e8d9c0b1a2f3e4d5c6b",
      "worktreeDigest": "sha256:1f0a",
      "outputTail": "1 passed",
      "outputTruncated": false
    }
  }
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

describe("readLedger: битый файл", () => {
  it("следы конфликта слияния дают evidence-broken с путём к файлу", () => {
    const root = workspace({ [LEDGER_PATH]: CONFLICT });

    const error = thrownBy(() => readLedger(root, CHANGE));

    expect(error.code).toBe("evidence-broken");
    expect(error.message).toContain(LEDGER_PATH);
    expect(ledgerText(root)).toBe(CONFLICT);
  });

  it("запись без кода возврата даёт ту же ошибку с меткой и недостающим полем", () => {
    const root = workspace({ [LEDGER_PATH]: WITHOUT_EXIT_CODE });

    const error = thrownBy(() => readLedger(root, CHANGE));

    expect(error.code).toBe("evidence-broken");
    expect(error.message).toContain("tests");
    expect(error.message).toContain("exitCode");
    expect(ledgerText(root)).toBe(WITHOUT_EXIT_CODE);
  });

  it("битый файл не переписывается записью новой метки", () => {
    const root = workspace({ [LEDGER_PATH]: CONFLICT });

    thrownBy(() => putRecord(root, CHANGE, "lint", LINT));

    expect(ledgerText(root)).toBe(CONFLICT);
  });
});
