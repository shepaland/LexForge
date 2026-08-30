import path from "node:path";

/**
 * The form a path takes in an answer: the separator is always `/`. A `--json`
 * answer is read by an agent, and it matches the path against what stands in
 * the spec, in the plan and in its own instructions, where the separator is a
 * slash. Inside the code paths stay the way the system writes them — otherwise
 * the first forgotten conversion is a file that cannot be read — so the
 * conversion stands at the border of the answer and nowhere else.
 *
 * Only what the system calls a separator is converted. On Linux and macOS a
 * backslash is an ordinary character of a file name and is left alone.
 */
export function answerPath(value: string, separator: string = path.sep): string {
  return separator === "/" ? value : value.split(separator).join("/");
}

/**
 * The path a finding is shown with: relative to the workspace root and written
 * with forward slashes, so the same file reads the same way on every machine.
 */
export function workspacePath(root: string, file: string): string {
  return answerPath(path.relative(root, file));
}
