import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unlockChange, withChangeLock } from "../../../src/core/tasks/lock.js";
import { lockPath, taskRecordPath } from "../../../src/core/tasks/paths.js";
import {
  listTaskRecords,
  readTaskRecord,
  writeTaskRecord,
  type TaskRecord,
} from "../../../src/core/tasks/records.js";
import { deadPid, writeLock } from "../../helpers/lock.js";

const linkFails = vi.hoisted(() => ({ on: false }));
vi.mock("node:fs", async (original) => {
  const real = await original<typeof import("node:fs")>();
  return {
    ...real,
    linkSync: (...args: Parameters<typeof real.linkSync>) => {
      if (linkFails.on) throw Object.assign(new Error("not supported"), { code: "EPERM" });
      return real.linkSync(...args);
    },
  };
});

const now = "2026-10-22T10:00:00.000Z";

const before: TaskRecord = {
  id: "2.1",
  origin: "native",
  executor: "e",
  branch: "lexforge/demo/2.1",
  worktree: "/w",
  base: "abc",
  startedAt: now,
  red: null,
  green: null,
  reviews: [],
  closed: null,
  attempts: 0,
};

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lexforge-lock-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("change lock", () => {
  it("runs the work and returns its result", () => {
    expect(withChangeLock(root, "demo", "task start 2.1", () => 42)).toBe(42);
  });
  it("refuses while a live process holds the lock", () => {
    writeLock(root, "demo", { pid: process.pid, startedAt: now, command: "task close 2.1" });
    expect(() => withChangeLock(root, "demo", "task start 2.2", () => 1)).toThrowError(
      expect.objectContaining({
        code: "change-locked",
        message: expect.stringContaining("task close 2.1"),
      }),
    );
  });
  it("names lexforge unlock when the holder is dead", () => {
    writeLock(root, "demo", { pid: deadPid(), startedAt: now, command: "task close 2.1" });
    expect(() => withChangeLock(root, "demo", "x", () => 1)).toThrowError(
      expect.objectContaining({ code: "stale-lock", nextStep: "lexforge unlock --change demo" }),
    );
  });
  it("treats an unreadable lock file as stale", () => {
    mkdirSync(dirname(lockPath(root, "demo")), { recursive: true });
    writeFileSync(lockPath(root, "demo"), "");
    expect(() => withChangeLock(root, "demo", "x", () => 1)).toThrowError(
      expect.objectContaining({ code: "stale-lock" }),
    );
  });
  it("removes the lock after the work, and after a throw", () => {
    expect(() =>
      withChangeLock(root, "demo", "x", () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(existsSync(lockPath(root, "demo"))).toBe(false);
    withChangeLock(root, "demo", "x", () => 1);
    expect(existsSync(lockPath(root, "demo"))).toBe(false);
  });
  it("does not remove a lock that another process took over", () => {
    withChangeLock(root, "demo", "x", () => {
      rmSync(lockPath(root, "demo"));
      writeLock(root, "demo", { pid: process.pid + 1, startedAt: now, command: "other" });
    });
    expect(JSON.parse(readFileSync(lockPath(root, "demo"), "utf8")).command).toBe("other");
  });
  it("never shows a half-written lock to a concurrent reader", () => {
    withChangeLock(root, "demo", "x", () => {
      const text = readFileSync(lockPath(root, "demo"), "utf8");
      expect(JSON.parse(text)).toMatchObject({ pid: process.pid, command: "x" });
      expect(readdirSync(dirname(lockPath(root, "demo")))).toEqual(["change.lock"]);
    });
  });
  it("unlock refuses a live holder and removes a dead one", () => {
    writeLock(root, "demo", { pid: process.pid, startedAt: now, command: "x" });
    expect(() => unlockChange(root, "demo")).toThrowError(
      expect.objectContaining({ code: "lock-held-by-live-process" }),
    );
    const dead = deadPid();
    writeLock(root, "demo", { pid: dead, startedAt: now, command: "x" });
    expect(unlockChange(root, "demo")).toEqual({ removed: true, pid: dead });
    expect(existsSync(lockPath(root, "demo"))).toBe(false);
  });
  it("unlock also clears leftover temporary lock files", () => {
    const dir = dirname(lockPath(root, "demo"));
    writeLock(root, "demo", { pid: deadPid(), startedAt: now, command: "x" });
    writeFileSync(`${lockPath(root, "demo")}.abc.tmp`, "{");
    unlockChange(root, "demo");
    expect(readdirSync(dir)).toEqual([]);
  });
  it("refuses with a next step when the file system cannot link", () => {
    linkFails.on = true;
    try {
      expect(() => withChangeLock(root, "demo", "x", () => 1)).toThrowError(
        expect.objectContaining({ code: "lock-unsupported", nextStep: expect.stringContaining("hard links") }),
      );
      expect(readdirSync(dirname(lockPath(root, "demo")))).toEqual([]);
    } finally {
      linkFails.on = false;
    }
  });
  it("unlock of a change with no lock removes nothing", () => {
    expect(unlockChange(root, "demo")).toEqual({ removed: false, pid: null });
  });
});

describe("atomic record write", () => {
  it("a process killed mid-write leaves the previous record whole", () => {
    writeTaskRecord(root, "demo", before);
    const file = taskRecordPath(root, "demo", "2.1");
    // The child does what save() does up to the rename: writes the temporary file, then dies.
    const script = `
      const fs = require("fs");
      fs.writeFileSync(${JSON.stringify(file + ".killed.tmp")}, '{"id": "2.1", "att');
      process.kill(process.pid, "SIGKILL");
    `;
    const run = spawnSync(process.execPath, ["-e", script]);
    expect(run.signal).toBe("SIGKILL");
    expect(readdirSync(dirname(file)).some((name) => name.endsWith(".tmp"))).toBe(true);
    expect(readTaskRecord(root, "demo", "2.1")).toEqual(before);
    expect(listTaskRecords(root, "demo")).toEqual([before]);
  });
});
