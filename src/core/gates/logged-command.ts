import { randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { changeDir } from "../execution/plan.js";
import { hashFile, local } from "../execution/files.js";
import { runLabelCommand, type RunCommandOptions } from "./run-command.js";
/** Stream to durable storage; echo is opt-in. The runner retains only a bounded tail. */
export async function runLoggedCommand(
  root: string,
  change: string,
  options: RunCommandOptions,
  stream = false,
) {
  const directory = `${changeDir(change)}/execution/logs`;
  mkdirSync(local(root, directory), { recursive: true });
  const log = `${directory}/${randomUUID()}.log`;
  const fd = openSync(local(root, log), "wx");
  const sink = (output: RunCommandOptions["stdout"]) => ({
    write(chunk: string) {
      writeSync(fd, chunk);
      if (stream) output.write(chunk);
    },
  });
  try {
    const result = await runLabelCommand({
      ...options,
      stdout: sink(options.stdout),
      stderr: sink(options.stderr),
    });
    return { ...result, log, logHash: hashFile(root, log) };
  } finally {
    closeSync(fd);
  }
}
