import { randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { hashFile, local } from "../tasks/files.js";
import { changeDir } from "../tasks/paths.js";
import { runLabelCommand, type RunCommandOptions } from "./run-command.js";
/** Stream to durable storage; echo is opt-in. The runner retains only a bounded tail. */
export async function runLoggedCommand(
  root: string,
  change: string,
  label: string,
  options: RunCommandOptions,
  stream = false,
) {
  // A log path that is not safe is fixed by hand, after which the same record is run again.
  const retry = `lexforge evidence record --change ${change} --label ${label}`;
  const directory = `${changeDir(change)}/execution/logs`;
  mkdirSync(local(root, directory, retry), { recursive: true });
  const log = `${directory}/${randomUUID()}.log`;
  const fd = openSync(local(root, log, retry), "wx");
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
    return { ...result, log, logHash: hashFile(root, log, retry) };
  } finally {
    closeSync(fd);
  }
}
