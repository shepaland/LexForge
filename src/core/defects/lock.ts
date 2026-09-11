import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import path from "node:path";

import { UsageError } from "../../cli/errors.js";
import { answerPath } from "../answer-path.js";
import { ledgerLockFile } from "./paths.js";

export { DEFECTS_LOCK_FILE, ledgerLockFile } from "./paths.js";

export interface LedgerLockOptions {
  /** Total time to wait for a held lock before giving up, in milliseconds. */
  waitMs?: number;
  /** How often to retry taking the lock, in milliseconds. */
  pollMs?: number;
}

/** Two executor agents write findings to the same ledger at once, and one wait is enough. */
const DEFAULT_WAIT_MS = 2_000;
const DEFAULT_POLL_MS = 20;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Takes the lock by creating the lock file exclusively, runs the callback,
 * then releases the lock in a `finally` so a callback that throws never
 * leaves the ledger locked. A lock already held is retried for a bounded
 * wait; a lock still held at the end of it is a refusal, not a corrupted
 * file — there is no automatic staleness timeout.
 */
export async function withLedgerLock<T>(
  root: string,
  callback: () => T | Promise<T>,
  options: LedgerLockOptions = {},
): Promise<T> {
  const waitMs = options.waitMs ?? DEFAULT_WAIT_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const lockFile = ledgerLockFile(root);

  const deadline = Date.now() + waitMs;
  for (;;) {
    if (takeLock(lockFile)) {
      break;
    }

    if (Date.now() >= deadline) {
      const shown = answerPath(lockFile);
      throw new UsageError(
        "defect-ledger-locked",
        `${shown} is held by another write${describeHolder(lockFile)}. ` +
          "Try again once it is released, or remove it if the process that created it is gone.",
        `wait and run this command again, or delete ${shown}`,
        lockFile,
      );
    }

    await sleep(pollMs);
  }

  try {
    return await callback();
  } finally {
    // On Windows a handle that closed a moment ago can still make `unlink`
    // answer EBUSY/EPERM; a bare `rmSync` there would replace the callback's
    // own return value or exception with a removal error that has nothing to
    // do with it.
    rmSync(lockFile, { force: true, maxRetries: 5, retryDelay: 20 });
  }
}

/**
 * Creates the lock file exclusively and stamps it with who is holding it.
 * `true` when this call took the lock.
 */
function takeLock(lockFile: string): boolean {
  try {
    mkdirSync(path.dirname(lockFile), { recursive: true });
    const fd = openSync(lockFile, "wx");
    const holder: LockHolder = { pid: process.pid, startedAt: new Date().toISOString() };
    writeSync(fd, JSON.stringify(holder));
    closeSync(fd);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return false;
    }
    throw error;
  }
}

interface LockHolder {
  pid: number;
  startedAt: string;
}

/**
 * The lock file's stamp, as a fragment to slot into the refusal message. The
 * advice to "remove it if the process that created it is gone" is not
 * actionable without naming which process; empty when the stamp cannot be
 * read, so a refusal never fails on top of a refusal.
 */
function describeHolder(lockFile: string): string {
  try {
    const holder = JSON.parse(readFileSync(lockFile, "utf8")) as Partial<LockHolder>;
    if (typeof holder.pid === "number" && typeof holder.startedAt === "string") {
      return ` (pid ${holder.pid}, started at ${holder.startedAt})`;
    }
  } catch {
    // The stamp is unreadable or predates this field. The refusal still
    // names the path, which is actionable on its own.
  }
  return "";
}
