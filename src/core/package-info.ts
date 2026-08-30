import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The version has one home: the `version` field of the package. Reading it
 * here keeps the printed number, the installed one and the published one from
 * drifting apart. The manifest sits two levels above this module, both in
 * `src/` and in `dist/`.
 */
export function packageVersion(): string {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    version: string;
  };

  return manifest.version;
}
