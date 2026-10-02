import { closeSync, openSync, unlinkSync } from "node:fs";
import { changeDir } from "./plan.js";
import { local, refuse } from "./files.js";
/** Serialise mutations of execution state; never steal a possibly live lock. */
export async function withExecutionLock<T>(
  root: string,
  change: string,
  action: () => Promise<T> | T,
): Promise<T> {
  const file = local(root, `${changeDir(change)}/execution.lock`);
  let fd: number;
  try {
    fd = openSync(file, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      refuse(
        "Execution is locked. Wait for the active command; after a crashed process, verify it has stopped before removing execution.lock",
      );
    throw error;
  }
  try {
    return await action();
  } finally {
    closeSync(fd);
    unlinkSync(file);
  }
}
