import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import {
  emptyRedRuns,
  putRedRun,
  readRedRuns,
  redRunFile,
  type RedRunRecord,
} from "../../../src/core/gates/red-run-store.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const CHANGE = "add-auth";
const STORE_PATH = `lexforge/changes/${CHANGE}/red-runs.json`;

const TASK_2_3: RedRunRecord = {
  command: "npx vitest run tests/core/gates/red-run-store.test.ts",
  exitCode: 1,
  startedAt: "2026-08-30T09:12:44.281Z",
  durationMs: 3140,
  head: "9f1c0b7a4e1d2c3b5a6f7e8d9c0b1a2f3e4d5c6b",
  worktreeDigest: "sha256:1f0a",
  outputTail: "FAIL tests/core/gates/red-run-store.test.ts",
  outputTruncated: false,
};

const TASK_2_4: RedRunRecord = {
  ...TASK_2_3,
  command: "npx vitest run tests/core/gates/red-run-record.test.ts",
  startedAt: "2026-08-30T09:14:01.000Z",
  durationMs: 900,
  outputTail: "FAIL tests/core/gates/red-run-record.test.ts",
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

function storeText(root: string): string {
  return readFileSync(path.join(root, STORE_PATH), "utf8");
}

describe("readRedRuns: файла нет", () => {
  it("каталог без файла даёт пустое хранилище", () => {
    const root = workspace();

    expect(existsSync(redRunFile(root, CHANGE))).toBe(false);
    expect(readRedRuns(root, CHANGE)).toEqual(emptyRedRuns());
    expect(emptyRedRuns()).toEqual({ outputVersion: 1, records: {} });
  });
});

describe("putRedRun: текст файла постоянен", () => {
  it("задачи отсортированы, отступ два пробела, файл кончается переводом строки", () => {
    const root = workspace();

    putRedRun(root, CHANGE, "2.4", TASK_2_4);
    putRedRun(root, CHANGE, "9.9", TASK_2_3);
    putRedRun(root, CHANGE, "2.3", TASK_2_3);
    const text = storeText(root);

    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain('\n  "records": {\n');
    expect(text.indexOf('"2.3"')).toBeLessThan(text.indexOf('"2.4"'));
    expect(text.indexOf('"2.4"')).toBeLessThan(text.indexOf('"9.9"'));
  });

  it("тот же набор задач, записанный в другом порядке, даёт тот же текст байт в байт", () => {
    const forward = workspace();
    putRedRun(forward, CHANGE, "2.3", TASK_2_3);
    putRedRun(forward, CHANGE, "2.4", TASK_2_4);
    const forwardText = storeText(forward);

    const backward = workspace();
    putRedRun(backward, CHANGE, "2.4", TASK_2_4);
    putRedRun(backward, CHANGE, "2.3", TASK_2_3);

    expect(storeText(backward)).toBe(forwardText);
  });
});

describe("putRedRun: соседние задачи", () => {
  it("запись задачи 2.4 оставляет запись 2.3 прежней", () => {
    const root = workspace();

    const after23 = putRedRun(root, CHANGE, "2.3", TASK_2_3);
    expect(Object.keys(after23.records)).toEqual(["2.3"]);

    const after24 = putRedRun(root, CHANGE, "2.4", TASK_2_4);

    expect(Object.keys(after24.records).sort()).toEqual(["2.3", "2.4"]);
    expect(after24.records["2.3"]).toEqual(TASK_2_3);
    expect(readRedRuns(root, CHANGE).records["2.3"]).toEqual(TASK_2_3);
    expect(readRedRuns(root, CHANGE).records["2.4"]).toEqual(TASK_2_4);
  });

  it("хранится в red-runs.json, отдельном от evidence.json", () => {
    const root = workspace();

    putRedRun(root, CHANGE, "2.3", TASK_2_3);

    expect(redRunFile(root, CHANGE)).toBe(path.join(root, STORE_PATH));
    expect(JSON.parse(storeText(root))).toEqual({
      outputVersion: 1,
      records: { "2.3": TASK_2_3 },
    });
  });

  it("повторная запись задачи заменяет её целиком, второй раз побеждает", () => {
    const root = workspace();
    putRedRun(root, CHANGE, "2.3", TASK_2_3);

    const again = putRedRun(root, CHANGE, "2.3", { ...TASK_2_3, exitCode: 2, durationMs: 12 });

    expect(Object.keys(again.records)).toEqual(["2.3"]);
    expect(again.records["2.3"]).toEqual({ ...TASK_2_3, exitCode: 2, durationMs: 12 });
    expect(readRedRuns(root, CHANGE).records["2.3"]).toEqual({
      ...TASK_2_3,
      exitCode: 2,
      durationMs: 12,
    });
  });
});

const CONFLICT = `{
  "outputVersion": 1,
  "records": {
<<<<<<< HEAD
    "2.3": { "exitCode": 1 }
=======
    "2.3": { "exitCode": 2 }
>>>>>>> other
  }
}
`;

const WITHOUT_EXIT_CODE = `{
  "outputVersion": 1,
  "records": {
    "2.3": {
      "command": "npx vitest run tests/core/gates/red-run-store.test.ts",
      "startedAt": "2026-08-30T09:12:44.281Z",
      "durationMs": 3140,
      "head": "9f1c0b7a4e1d2c3b5a6f7e8d9c0b1a2f3e4d5c6b",
      "worktreeDigest": "sha256:1f0a",
      "outputTail": "FAIL",
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

describe("readRedRuns: битый файл", () => {
  it("следы конфликта слияния останавливают чтение и называют файл", () => {
    const root = workspace({ [STORE_PATH]: CONFLICT });

    const error = thrownBy(() => readRedRuns(root, CHANGE));

    expect(error.code).toBe("red-runs-broken");
    expect(error.message).toContain(STORE_PATH);
    expect(storeText(root)).toBe(CONFLICT);
  });

  it("запись без кода возврата даёт ту же ошибку с задачей и недостающим полем", () => {
    const root = workspace({ [STORE_PATH]: WITHOUT_EXIT_CODE });

    const error = thrownBy(() => readRedRuns(root, CHANGE));

    expect(error.code).toBe("red-runs-broken");
    expect(error.message).toContain("2.3");
    expect(error.message).toContain("exitCode");
    expect(storeText(root)).toBe(WITHOUT_EXIT_CODE);
  });

  it("битый файл не переписывается записью новой задачи", () => {
    const root = workspace({ [STORE_PATH]: CONFLICT });

    thrownBy(() => putRedRun(root, CHANGE, "2.4", TASK_2_4));

    expect(storeText(root)).toBe(CONFLICT);
  });
});
