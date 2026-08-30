import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Every field the packaging spec requires `package.json` to carry. */
const REQUIRED_FIELDS = [
  "name",
  "version",
  "description",
  "license",
  "author",
  "repository",
  "homepage",
  "bugs",
  "keywords",
  "engines",
  "bin",
  "files",
  "type",
  "publishConfig",
];

const manifest = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as Record<
  string,
  unknown
>;

describe("метаданные пакета", () => {
  it("несёт все четырнадцать перечисленных полей", () => {
    for (const field of REQUIRED_FIELDS) {
      expect(manifest[field], field).toBeDefined();
    }
  });

  it("поле bin называет ровно одну команду lexforge", () => {
    expect(Object.keys(manifest.bin as Record<string, string>)).toEqual(["lexforge"]);
  });
});
