import { execFileSync } from "node:child_process";

import { UsageError } from "../../cli/errors.js";

/**
 * Output cap for one git call. A status listing of a large tree is still far
 * short of this, and a run that overflows it is better stopped than truncated.
 */
const MAX_BUFFER = 64 * 1024 * 1024;

export interface GitCall {
  /** True when git finished with exit code `0`. */
  ok: boolean;
  /** Standard output on success, the error text otherwise. */
  output: string;
}

/**
 * Runs git in the given directory. A non-zero exit code is returned, not
 * thrown: whether the directory is a repository is asked exactly this way.
 * Failing to start git at all is a different matter and stops the command.
 */
export function tryGit(root: string, args: string[]): GitCall {
  try {
    const stdout = execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: MAX_BUFFER,
      stdio: ["ignore", "pipe", "pipe"],
    });

    return { ok: true, output: stdout };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { status?: number | null; stderr?: string };

    if (typeof failure.status !== "number") {
      throw new UsageError(
        "git-missing",
        `git could not be started in ${root}: ${failure.message}. ` +
          "This command reads the state of the repository, so git has to be on the PATH.",
        "install git, then run this command again",
      );
    }

    return { ok: false, output: (failure.stderr ?? failure.message).trim() };
  }
}

/** Runs git and returns its output with the trailing newline dropped. */
export function readGit(root: string, args: string[]): string {
  const call = tryGit(root, args);

  if (!call.ok) {
    throw new UsageError(
      "git-failed",
      `git ${args.join(" ")} failed in ${root}: ${call.output}`,
      "fix the repository, then run this command again",
    );
  }

  return call.output.replace(/\n+$/, "");
}

/**
 * Stops the command when the directory is not inside a repository. The check
 * runs `rev-parse` rather than looking for a `.git` directory: a linked
 * worktree keeps a file there, and a submodule keeps nothing.
 */
export function assertRepository(root: string): void {
  if (tryGit(root, ["rev-parse", "--show-toplevel"]).ok) {
    return;
  }

  throw new UsageError(
    "git-missing",
    `${root} is not inside a git repository. An evidence record is tied to a commit ` +
      "and to the state of the working tree, and there is neither here.",
    "git init",
  );
}

/**
 * The commit the working tree stands on. A repository without a single commit
 * stops the command: there is nothing to tie an evidence record to.
 */
export function readHead(root: string): string {
  const call = tryGit(root, ["rev-parse", "--verify", "HEAD"]);

  if (!call.ok) {
    throw new UsageError(
      "git-no-commit",
      `the repository at ${root} has no commits yet, so an evidence record has ` +
        "nothing to point at.",
      "git commit",
    );
  }

  return call.output.trim();
}
