import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { taskRecordPath } from "../../../src/core/tasks/paths.js";
import {
  listTaskRecords,
  readTaskRecord,
  writeTaskRecord,
  type TaskRecord,
} from "../../../src/core/tasks/records.js";

function record(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "1.1",
    origin: "native",
    executor: "executor-1",
    branch: "lexforge/demo/1.1",
    worktree: "/tmp/w",
    base: "abc123",
    startedAt: "2026-10-22T10:00:00.000Z",
    red: null,
    green: null,
    reviews: [],
    closed: null,
    attempts: 0,
    ...overrides,
  };
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lexforge-records-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("task records", () => {
  it("writes a record and reads it back", () => {
    writeTaskRecord(root, "demo", record({ id: "2.1" }));
    expect(readTaskRecord(root, "demo", "2.1")).toEqual(record({ id: "2.1" }));
  });
  it("returns null for a task that never started", () => {
    expect(readTaskRecord(root, "demo", "9.9")).toBeNull();
  });
  it("lists records in plan order", () => {
    for (const id of ["10.1", "2.1", "2.10", "2.2"]) writeTaskRecord(root, "demo", record({ id }));
    expect(listTaskRecords(root, "demo").map((r) => r.id)).toEqual(["2.1", "2.2", "2.10", "10.1"]);
  });
  it("refuses a record with a field the schema does not know", () => {
    mkdirSync(dirname(taskRecordPath(root, "demo", "2.1")), { recursive: true });
    writeFileSync(
      taskRecordPath(root, "demo", "2.1"),
      JSON.stringify({ ...record({ id: "2.1" }), extra: 1 }),
    );
    expect(() => readTaskRecord(root, "demo", "2.1")).toThrowError(
      expect.objectContaining({
        code: "task-record-unreadable",
        nextStep: "lexforge resume --change demo",
      }),
    );
  });
  it("refuses a file that is not JSON", () => {
    mkdirSync(dirname(taskRecordPath(root, "demo", "2.1")), { recursive: true });
    writeFileSync(taskRecordPath(root, "demo", "2.1"), "{nope");
    expect(() => readTaskRecord(root, "demo", "2.1")).toThrowError(
      expect.objectContaining({ code: "task-record-unreadable" }),
    );
  });
  it("leaves no temporary file behind", () => {
    writeTaskRecord(root, "demo", record({ id: "2.1" }));
    expect(readdirSync(dirname(taskRecordPath(root, "demo", "2.1")))).toEqual(["2.1.json"]);
  });
});
