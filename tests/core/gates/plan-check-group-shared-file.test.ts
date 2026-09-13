import { afterEach, describe, expect, it } from "vitest";

import { checkPlan } from "../../../src/core/gates/plan-check.js";
import { removeWorkspace } from "../../helpers/workspace.js";
import {
  CHANGE,
  created,
  groupsWorkspace,
  sectionFile,
} from "./plan-check-groups-fixtures.js";

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

const SHARED_FILE_FILE = sectionFile("tasks/05-shared-file.md");
const SHARED_FILE_SECTION = [
  "Depends on: none",
  "",
  "- [ ] 5.1 [A] Write the failing test in `tests/core/gates/plan-check.test.ts` for the new checks",
  "- [ ] 5.2 [A] Run `tests/core/gates/plan-check.test.ts` through evidence red and watch it fail",
  "- [ ] 5.3 [B] Write the implementation named in `tests/core/gates/plan-check.test.ts` and rerun it",
  "",
].join("\n");

/**
 * The shared file is each group's second file, not its first - this catches
 * a comparison narrowed to just the first file of each group, which the
 * fixture above cannot: there, the shared file already sits first on both
 * sides.
 */
const SHARED_SECOND_FILE_FILE = sectionFile("tasks/06-shared-second-file.md");
const SHARED_SECOND_FILE_SECTION = [
  "Depends on: none",
  "",
  "- [ ] 6.1 [A] Write the failing test in `tests/core/gates/plan-check.test.ts` for the new case",
  "- [ ] 6.2 [A] Also touch `src/core/gates/plan-check.ts` while adding the group check",
  "- [ ] 6.3 [B] Touch only `src/core/gates/plan-check.ts`, no other file at all",
  "",
].join("\n");

const SHARED_CHECK_COMMAND_FILE = sectionFile("tasks/07-shared-check-command.md");
const SHARED_CHECK_COMMAND_SECTION = [
  "Depends on: none",
  "",
  "- [ ] 7.1 [A] Write the failing test in `x.test.ts`",
  "- [ ] 7.2 [A] Run the test above and watch it fail. Check: `npx vitest run x.test.ts`",
  "- [ ] 7.3 [B] Write the implementation. Check: `npx vitest run x.test.ts`",
  "",
].join("\n");

const TRIPLE_RED_WRAPPER_SECTION = [
  "Depends on: none",
  "- [ ] 11.1 [A] Write the failing test for the new rule",
  '- [ ] 11.2 [A] Record the red run. Check: `node bin/lexforge.js evidence red --change c --task 11.3 --command "npx vitest run tests/core/gates/x.test.ts"`',
  "- [ ] 11.3 [B] Write the implementation. Check: `npx vitest run tests/core/gates/x.test.ts`",
].join("\n");

/** Section 8 writes its own file; section 9 writes a different one. */
const LOAD_SECTION = [
  "Depends on: none",
  "",
  "- [ ] 8.1 [A] Write the config loader in `src/config/load.ts`. Check: `npx vitest run shared.test.ts`",
  "",
].join("\n");
const SAVE_SECTION = [
  "Depends on: none",
  "",
  "- [ ] 9.1 [A] Write the config saver in `src/config/save.ts`. Check: `npx vitest run shared.test.ts`",
  "",
].join("\n");

describe("checkPlan: два ярлыка одной секции называют один файл", () => {
  it("два ярлыка одной секции называют один файл в обратных кавычках: section-group-shared-file", () => {
    const root = groupsWorkspace([
      {
        heading: "## 5. Group label shared file",
        linkPath: "tasks/05-shared-file.md",
        body: SHARED_FILE_SECTION,
      },
    ]);

    const result = checkPlan({ cwd: root, change: CHANGE });
    const findings = result.data.findings;

    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("section-group-shared-file");
    expect(findings[0]!.file).toBe(SHARED_FILE_FILE);
    expect(findings[0]!.message).toContain("5");
    expect(findings[0]!.message).toContain("A");
    expect(findings[0]!.message).toContain("B");
    expect(findings[0]!.message).toContain("tests/core/gates/plan-check.test.ts");
    expect(result.exitCode).toBe(1);
  });

  it("общий файл совпадает как второй файл каждой группы, а не первый", () => {
    const root = groupsWorkspace([
      {
        heading: "## 6. Group label shares only a second file",
        linkPath: "tasks/06-shared-second-file.md",
        body: SHARED_SECOND_FILE_SECTION,
      },
    ]);

    const result = checkPlan({ cwd: root, change: CHANGE });
    const findings = result.data.findings;

    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("section-group-shared-file");
    expect(findings[0]!.line).toBe(5);
    expect(findings[0]!.file).toBe(SHARED_SECOND_FILE_FILE);
    expect(findings[0]!.message).toContain("6");
    expect(findings[0]!.message).toContain("A");
    expect(findings[0]!.message).toContain("B");
    expect(findings[0]!.message).toContain("src/core/gates/plan-check.ts");
    expect(result.exitCode).toBe(1);
  });
});

describe("checkPlan: файл только в Check-команде", () => {
  it("файл, названный только в Check-командах двух групп, даёт section-group-shared-file", () => {
    const root = groupsWorkspace([
      {
        heading: "## 7. Shared file named only inside Check commands",
        linkPath: "tasks/07-shared-check-command.md",
        body: SHARED_CHECK_COMMAND_SECTION,
      },
    ]);

    const result = checkPlan({ cwd: root, change: CHANGE });
    const findings = result.data.findings;

    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("section-group-shared-file");
    expect(findings[0]!.line).toBe(5);
    expect(findings[0]!.file).toBe(SHARED_CHECK_COMMAND_FILE);
    expect(findings[0]!.message).toContain("7");
    expect(findings[0]!.message).toContain("A");
    expect(findings[0]!.message).toContain("B");
    expect(findings[0]!.message).toContain("x.test.ts");
    expect(result.exitCode).toBe(1);
  });

  it("два раздела читают один файл через Check, но пишут разные — section-concurrent-file не срабатывает", () => {
    const root = groupsWorkspace([
      {
        heading: "## 8. Section eight writes its own file",
        linkPath: "tasks/08-load.md",
        body: LOAD_SECTION,
      },
      {
        heading: "## 9. Section nine writes a different file",
        linkPath: "tasks/09-save.md",
        body: SAVE_SECTION,
      },
    ]);

    const result = checkPlan({ cwd: root, change: CHANGE });

    expect(result.data.findings).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it("файл общий под обёрткой evidence red всё ещё даёт section-group-shared-file", () => {
    const root = groupsWorkspace([
      {
        heading: "## 11. Triple shares its file even wrapped in evidence red",
        linkPath: "tasks/11-triple-red-wrapper.md",
        body: TRIPLE_RED_WRAPPER_SECTION,
      },
    ]);
    const findings = checkPlan({ cwd: root, change: CHANGE }).data.findings;

    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("section-group-shared-file");
    expect(findings[0]!.message).toContain("Section 11's groups A and B");
    expect(findings[0]!.message).toContain("tests/core/gates/x.test.ts");
  });
});
