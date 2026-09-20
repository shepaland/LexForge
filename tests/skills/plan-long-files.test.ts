import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { section } from "./helpers.js";

/**
 * `plan-file-per-section.md` has no dedicated helper in `helpers.ts`. The closest
 * precedent - `task-sizing.md` pinned in `plan-move-declaration.test.ts` - reads its
 * own file directly and hands the body to the generic `section` helper; this test
 * follows the same route rather than adding a new helper for a single section.
 */
function planFilePerSectionBody(): string {
  const path = fileURLToPath(
    new URL("../../skills/lexforge-plan/plan-file-per-section.md", import.meta.url),
  );
  return readFileSync(path, "utf8");
}

/** The `## Long files` section, whitespace runs collapsed to one space. */
function longFilesSection(): string {
  return section(planFilePerSectionBody(), "Long files").replace(/\s+/g, " ").trim();
}

/**
 * Pinned word for word. Covers the requirements
 * `planning-skills-content#The plan skill asks the user for the path before writing the
 * plan` and `planning-skills-content#On the refactor path the splitting comes first` in
 * `lexforge/changes/file-line-limit/specs/planning-skills-content/spec.md`. No excuse/
 * reality table: the pressure run in
 * `tests/scenarios/lexforge-plan/long-file-pick-for-me.md` picked the lawful option (A)
 * and left no rationalization to answer.
 */
const EXPECTED_LONG_FILES_SECTION =
  "## Long files Before `tasks.md` is written, count the lines of every existing file " +
  "the tasks will name that `file_limit.include` in `lexforge/config.yaml` covers, with " +
  "`wc -l`. The limit is `file_limit.lines`, 400 lines and source files and tests when " +
  "the section is absent. When any of them is over the limit, show the user each such " +
  "file with its line count, ask one question - `refactor` or `keep` - and wait for the " +
  "answer. The skill never chooses the path itself, and a user who hands the choice back " +
  "still gets the question asked of them. Write the answer as `long_files: <answer>` in " +
  "the change's `.lexforge.yaml` before `tasks.md` is written. With no file over the " +
  "limit, ask nothing. On `refactor`, each long file the plan names gets a task declared " +
  "`(move)` that splits it, coming before every other task that names the same file. On " +
  "`keep`, a task that would add code to a long file names a new file for that code " +
  "instead.";

describe("раздел «Long files» держит правило целиком", () => {
  it("текст раздела совпадает с ожидаемым дословно", () => {
    expect(longFilesSection()).toBe(EXPECTED_LONG_FILES_SECTION);
  });

  /**
   * A substring backstop under the whole-section `toBe` above, for
   * `planning-skills-content#The plan skill asks the user for the path before writing
   * the plan`: it catches a rewrite that drops the phrase "never chooses the path" or
   * negates it outright. It does not catch a rewrite that keeps the phrase and carves
   * an exception around it - "never chooses the path itself, except when the user is
   * busy" would still pass this test. The whole-section pin is what actually guards
   * against that; this one only backstops the substring.
   */
  it("скилл никогда не выбирает путь сам", () => {
    const text = longFilesSection();

    expect(text).toContain("never chooses the path");
    expect(text).not.toContain("except when");
  });

  it("не оставляет лазейки «пользователь сам сказал выбрать» или «пользователь недоступен»", () => {
    const text = longFilesSection();

    expect(text).not.toContain("choose the path yourself");
    expect(text).not.toContain("if the user is unavailable");
  });
});
