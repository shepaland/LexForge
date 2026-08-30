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

/**
 * The `engines.node` field of `package.json`, such as `>=20.19.0`. The two
 * readers of this field are `bin/runtime-check.js`, plain JavaScript that runs
 * before the build is loaded, and the `runtime` health check of `src/core/`;
 * both compare against it, neither imports the other.
 */
export function requiredNodeVersion(): string {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    engines: { node: string };
  };

  return manifest.engines.node;
}
