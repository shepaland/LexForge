import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { UsageError } from "../../cli/errors.js";
import { lockPath } from "./paths.js";

const LockSchema = z
  .object({ pid: z.number().int().positive(), startedAt: z.string(), command: z.string() })
  .strict();
type LockContent = z.infer<typeof LockSchema>;

/** Signal 0 sends nothing: ESRCH means the process is gone, EPERM means it is there and not ours. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function readLock(file: string): LockContent | null {
  try {
    return LockSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

function staleLock(change: string, held: LockContent | null): UsageError {
  const who = held ? `process ${held.pid} (${held.command}) is not running` : "the lock file cannot be read";
  return new UsageError(
    "stale-lock",
    `the change ${change} is locked, but ${who}.`,
    `lexforge unlock --change ${change}`,
  );
}

export function withChangeLock<T>(root: string, change: string, command: string, work: () => T): T {
  const file = lockPath(root, change);
  mkdirSync(path.dirname(file), { recursive: true });
  let fd: number;
  try {
    fd = openSync(file, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const held = readLock(file);
    if (!held || !alive(held.pid)) throw staleLock(change, held);
    throw new UsageError(
      "change-locked",
      `the change ${change} is locked by process ${held.pid}, running "${held.command}" since ${held.startedAt}.`,
      "wait for that command to finish, then run this command again",
    );
  }
  try {
    const content: LockContent = { pid: process.pid, startedAt: new Date().toISOString(), command };
    writeSync(fd, JSON.stringify(content));
    closeSync(fd);
    fd = -1;
    return work();
  } finally {
    if (fd >= 0) closeSync(fd);
    try {
      unlinkSync(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export function unlockChange(root: string, change: string): { removed: boolean; pid: number | null } {
  const file = lockPath(root, change);
  let exists = true;
  try {
    readFileSync(file);
  } catch {
    exists = false;
  }
  if (!exists) return { removed: false, pid: null };
  const held = readLock(file);
  if (held && alive(held.pid)) {
    throw new UsageError(
      "lock-held-by-live-process",
      `process ${held.pid} still holds the lock of ${change}, running "${held.command}".`,
      "wait for that process to finish, or stop it, then run lexforge unlock again",
    );
  }
  unlinkSync(file);
  return { removed: true, pid: held ? held.pid : null };
}
