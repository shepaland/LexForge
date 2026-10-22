import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { lockPath } from "../../src/core/tasks/paths.js";

export interface LockContent {
  pid: number;
  startedAt: string;
  command: string;
}

/** Writes the lock file of a change as a holder with this pid would have left it. */
export function writeLock(root: string, change: string, lock: LockContent): void {
  const file = lockPath(root, change);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(lock));
}

/** The pid of a process that has already exited. */
export function deadPid(): number {
  const run = spawnSync(process.execPath, ["-e", ""], { stdio: "ignore" });
  if (typeof run.pid !== "number") throw new Error("could not start a child process");
  return run.pid;
}
