import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { parseOutputTarget } from "../schemas/output-target.js";

/** A file counts as written only when it holds at least one non-whitespace character. */
function hasText(file: string): boolean {
  try {
    return readFileSync(file, "utf8").trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Is the artifact written? For a single file: the file exists and holds text.
 * For a set: at least one file under the directory holds text.
 */
export function probeFilled(changeDir: string, generates: string): boolean {
  const target = parseOutputTarget(generates);
  const base = path.resolve(changeDir);

  if (target.kind === "file") {
    const file = path.join(base, target.path);
    return existsSync(file) && statSync(file).isFile() && hasText(file);
  }

  return hasFilledFile(path.join(base, target.dir), `.${target.extension}`);
}

function hasFilledFile(dir: string, extension: string): boolean {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (hasFilledFile(full, extension)) {
        return true;
      }
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(extension) && hasText(full)) {
      return true;
    }
  }

  return false;
}
