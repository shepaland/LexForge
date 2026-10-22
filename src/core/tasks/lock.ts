import { linkSync, readdirSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
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
  const content: LockContent = { pid: process.pid, startedAt: new Date().toISOString(), command };
  // Written whole under a temporary name, then linked into place: the lock file never exists half-written.
  const tmp = `${file}.${randomUUID()}.tmp`;
  writeFileSync(tmp, JSON.stringify(content), { flag: "wx" });
  try {
    linkSync(tmp, file);
  } catch (error) {
    const errno = (error as NodeJS.ErrnoException).code;
    if (errno !== "EEXIST")
      throw new UsageError(
        "lock-unsupported",
        `the lock of ${change} cannot be taken in ${path.dirname(file)}: ${errno ?? "link failed"}.`,
        "move the project to a file system that supports hard links, then run this command again",
      );
    const held = readLock(file);
    if (!held || !alive(held.pid)) throw staleLock(change, held);
    throw new UsageError(
      "change-locked",
      `the change ${change} is locked by process ${held.pid}, running "${held.command}" since ${held.startedAt}.`,
      "wait for that command to finish, then run this command again",
    );
  } finally {
    unlinkSync(tmp);
  }
  try {
    return work();
  } finally {
    // Remove only our own lock: `unlock` may have taken it and another process may hold a new one.
    if (readLock(file)?.pid === process.pid) {
      try {
        unlinkSync(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
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
      `wait for process ${held.pid} to finish, then run: lexforge unlock --change ${change}`,
    );
  }
  unlinkSync(file);
  const dir = path.dirname(file);
  const leftover = `${path.basename(file)}.`;
  for (const name of readdirSync(dir))
    if (name.startsWith(leftover) && name.endsWith(".tmp")) unlinkSync(path.join(dir, name));
  return { removed: true, pid: held ? held.pid : null };
}
