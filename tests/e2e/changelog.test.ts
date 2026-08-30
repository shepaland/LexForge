import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readTextFile } from "../../src/core/read-text.js";
import {
  changelogOrderViolation,
  changelogVersionMismatch,
  parseChangelogEntries,
} from "../helpers/changelog.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const packageVersion = (
  JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as { version: string }
).version;

const entries = parseChangelogEntries(readTextFile(path.join(REPO_ROOT, "CHANGELOG.md")));

describe("журнал изменений", () => {
  it("верхняя запись несёт номер версии, равный полю version пакета", () => {
    const mismatch = changelogVersionMismatch(packageVersion, entries);
    expect(mismatch).toBeNull();
  });

  it("записи идут от новой к старой, и каждая несёт дату в форме YYYY-MM-DD", () => {
    expect(entries.length, "в CHANGELOG.md нет ни одной записи вида «## версия — дата»").toBeGreaterThan(0);

    for (const entry of entries) {
      expect(entry.date, `запись ${entry.version} несёт дату не в форме YYYY-MM-DD`).toMatch(
        /^\d{4}-\d{2}-\d{2}$/,
      );
    }

    const violation = changelogOrderViolation(entries);
    expect(violation).toBeNull();
  });
});
