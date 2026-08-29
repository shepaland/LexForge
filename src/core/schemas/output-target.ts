import { UsageError } from "../../cli/errors.js";

/** Where an artifact writes its result: one file, or every file under a directory. */
export type OutputTarget =
  | { kind: "file"; path: string }
  | { kind: "glob"; dir: string; extension: string };

export type OutputKind = OutputTarget["kind"];

const SEGMENT = "[A-Za-z0-9._-]+";
const FILE_FORM = new RegExp(`^(?:${SEGMENT}/)*${SEGMENT}\\.[A-Za-z0-9]+$`);
const GLOB_FORM = new RegExp(`^((?:${SEGMENT}/)*${SEGMENT})/\\*\\*/\\*\\.([A-Za-z0-9]+)$`);

/**
 * Two forms are accepted and no others: `<name>.<extension>` for a single file
 * and `<directory>/**\/*.<extension>` for a set of files.
 */
export function parseOutputTarget(generates: string): OutputTarget {
  const glob = GLOB_FORM.exec(generates);
  if (glob) {
    return { kind: "glob", dir: glob[1]!, extension: glob[2]! };
  }

  if (!generates.includes("*") && FILE_FORM.test(generates)) {
    return { kind: "file", path: generates };
  }

  throw new UsageError(
    "schema-invalid",
    `generates: "${generates}" is not a supported form. ` +
      "Use a file name like proposal.md, or a glob like specs/**/*.md.",
  );
}
