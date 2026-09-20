import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { startLineCount } from "../git/change-base.js";
import { makeFinding, type Finding } from "../validation/finding.js";
import type { ProjectConfig } from "../workspace/project-config.js";
import { breaksPath, countLines, isCovered, type LongFilesPath } from "./line-limit.js";

/**
 * The line-limit dimension of `verify`: every covered file the change
 * touched that breaks its path's rule for long files. A file the change
 * deleted, or one the size limit does not cover, is not judged - there is
 * nothing on disk left to measure. The start of each file comes from the
 * base commit, never the working tree, so a file's own growth during the
 * change is what gets judged, not its absolute size.
 */
export function lineLimitFindings(
  root: string,
  base: string,
  changed: string[],
  sizeLimit: ProjectConfig["sizeLimit"],
  longFilePath: LongFilesPath | null,
): Finding[] {
  const findings: Finding[] = [];

  for (const file of changed) {
    const finding = checkOneFile(root, base, file, sizeLimit, longFilePath);
    if (finding) {
      findings.push(finding);
    }
  }

  return findings;
}

/**
 * Checks one changed file. Returns `null` for a file the change deleted, one
 * the size limit's patterns do not cover, or one that keeps to its change's
 * path for long files.
 */
function checkOneFile(
  root: string,
  base: string,
  file: string,
  sizeLimit: ProjectConfig["sizeLimit"],
  longFilePath: LongFilesPath | null,
): Finding | null {
  const absolute = path.join(root, file);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    return null;
  }
  if (!isCovered(file, sizeLimit.patterns)) {
    return null;
  }

  const start = startLineCount(root, base, file);
  const now = countLines(readFileSync(absolute, "utf8"));

  if (!breaksPath({ start, now }, sizeLimit.max, longFilePath ?? "refactor")) {
    return null;
  }

  return makeFinding(
    file,
    1,
    "file-over-line-limit",
    lineLimitMessage(file, start, now, sizeLimit.max, longFilePath),
  );
}

/** The `!` pattern is how the reader tells generated code out of the count. */
const EXCLUSION_HINT =
  "Add a `!` pattern to `file_limit.include` to leave generated code out of the count.";

/**
 * Names the file, its size then and now, and the limit it broke - `null`
 * start reads as a new file, since it has no size at the start to compare
 * against. With no `long_files` path recorded, the message adds the two ways
 * out this dimension judged the file by, on top of the size it named: record
 * a path, or split the file.
 */
function lineLimitMessage(
  file: string,
  start: number | null,
  now: number,
  limit: number,
  longFilePath: LongFilesPath | null,
): string {
  const size =
    start === null
      ? `\`${file}\` is new and already ${now} lines, over the limit of ${limit}.`
      : `\`${file}\` was ${start} lines at the start of the change and is ${now} now, over ` +
        `the limit of ${limit}.`;

  if (longFilePath === null) {
    return (
      `${size} No \`long_files\` path is recorded for this change, so it is judged as ` +
      "refactor. Record `long_files: refactor` or `long_files: keep` in .lexforge.yaml, or " +
      `split the file to bring it back under the limit. ${EXCLUSION_HINT}`
    );
  }

  return `${size} ${EXCLUSION_HINT}`;
}
