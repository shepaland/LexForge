import picomatch from "picomatch";

/**
 * Counts a file's lines the way `wc -l` does: the number of `\n` characters
 * in it, CRLF included (the `\r` before `\n` does not add a second count).
 * A file with no trailing newline undercounts its last line by one, same as
 * `wc -l` — that is the intended behaviour, not an edge case to fix.
 */
export function countLines(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") {
      count += 1;
    }
  }
  return count;
}

/**
 * Whether `file` falls under the line limit's `include` list. A pattern
 * starting with `!` excludes rather than includes; the `!` is stripped
 * before matching. The path is covered when it matches at least one
 * positive pattern and none of the negated ones.
 */
export function isCovered(file: string, include: string[]): boolean {
  let matched = false;
  for (const pattern of include) {
    const negated = pattern.startsWith("!");
    const glob = negated ? pattern.slice(1) : pattern;
    const isMatch = picomatch(glob, { dot: true });
    if (isMatch(file)) {
      if (negated) {
        return false;
      }
      matched = true;
    }
  }
  return matched;
}

/**
 * Which of the two paths a change follows for files already over the limit
 * at the start: `refactor` brings every touched covered file within the
 * limit; `keep` lets a file that started over the limit stay over it, as
 * long as it does not grow past where it started.
 */
export type LongFilesPath = "refactor" | "keep";

/**
 * A file's line count at the start of the change (`null` for a new file)
 * and at the point checked now.
 */
export interface LineCounts {
  start: number | null;
  now: number;
}

/**
 * Whether a covered file breaks its change's path. A file within the limit
 * now never breaks. Over the limit, it breaks unless the path is `keep` and
 * the file was already over the limit at the start and has not grown past
 * its starting count — the one case `keep` allows a long file to remain in.
 */
export function breaksPath(counts: LineCounts, limit: number, path: LongFilesPath): boolean {
  if (counts.now <= limit) {
    return false;
  }
  const startedOverLimit = counts.start !== null && counts.start > limit;
  const staysAtOrUnderStart = counts.start !== null && counts.now <= counts.start;
  const keptWithinItsPath = path === "keep" && startedOverLimit && staysAtOrUnderStart;
  return !keptWithinItsPath;
}
