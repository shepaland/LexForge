import { afterAll, describe, expect, it } from "vitest";

import { checkLongFiles } from "../../../src/core/gates/plan-check-long-files.js";
import { parseTaskList, type PlanTasks } from "../../../src/core/gates/task-list.js";
import { DEFAULT_FILE_LIMIT_INCLUDE } from "../../../src/core/workspace/project-config.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const FILE = "lexforge/changes/add-refunds/tasks.md";
const LIMIT = { max: 400, patterns: DEFAULT_FILE_LIMIT_INCLUDE };

const root = makeWorkspace({
  "src/billing.ts": "x\n".repeat(612),
  "src/cart.ts": "x\n".repeat(380),
  "docs/guide.md": "x\n".repeat(612),
});

afterAll(() => {
  removeWorkspace(root);
});

/** Builds the parsed plan the check reads, out of the lines of a tasks.md. */
function plan(...lines: string[]): PlanTasks {
  return { file: FILE, tasks: parseTaskList(lines.join("\n"), FILE) };
}

describe("checkLongFiles: путь не записан", () => {
  it("длинный файл без пути даёт находку long-file-without-path на строке первой задачи", () => {
    const p = plan(
      "- [ ] 1.1 Add a refund method to `src/billing.ts`",
      "- [ ] 1.2 Write the test for it",
    );

    const findings = checkLongFiles(root, p, LIMIT, null);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("long-file-without-path");
    expect(findings[0]!.line).toBe(p.tasks[0]!.line);
    expect(findings[0]!.message).toContain("src/billing.ts");
    expect(findings[0]!.message).toContain("612");
    expect(findings[0]!.message).toContain("400");
    expect(findings[0]!.message).toContain("refactor");
    expect(findings[0]!.message).toContain("keep");
  });

  it("две задачи называют один и тот же длинный файл — находка всё равно одна", () => {
    const p = plan(
      "- [ ] 1.1 Add a refund method to `src/billing.ts`",
      "- [ ] 1.2 Add another method to `src/billing.ts`",
    );

    const findings = checkLongFiles(root, p, LIMIT, null);

    expect(findings).toHaveLength(1);
  });

  it("long_files: keep снимает находку", () => {
    const p = plan("- [ ] 1.1 Add a refund method to `src/billing.ts`");

    const findings = checkLongFiles(root, p, LIMIT, "keep");

    expect(findings).toHaveLength(0);
  });
});

describe("checkLongFiles: путь refactor", () => {
  it("первая задача не объявлена (move) — находка long-file-not-split-first", () => {
    const p = plan(
      "- [ ] 1.1 Add a refund method to `src/billing.ts`",
      "- [ ] 1.2 Write the test for it",
    );

    const findings = checkLongFiles(root, p, LIMIT, "refactor");

    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("long-file-not-split-first");
    expect(findings[0]!.message).toContain("src/billing.ts");
    expect(findings[0]!.message).toContain(p.tasks[0]!.number);
  });

  it("первая задача объявлена (move), следующая дорабатывает файл — находок нет", () => {
    const p = plan(
      "- [ ] 1.1 [P] (move) Split billing helpers out of `src/billing.ts`",
      "- [ ] 1.2 [P] Add a refund method to `src/billing.ts`",
    );

    const findings = checkLongFiles(root, p, LIMIT, "refactor");

    expect(findings).toHaveLength(0);
  });
});

describe("checkLongFiles: файлы, которых находка не касается", () => {
  it("короткий файл, файл вне диска и длинный неохваченный файл не дают находок ни на одном пути", () => {
    const p = plan(
      "- [ ] 1.1 Add a filter to `src/cart.ts`",
      "- [ ] 1.2 Update `src/missing.ts`",
      "- [ ] 1.3 Reword `docs/guide.md`",
    );

    for (const longFilePath of [null, "keep", "refactor"] as const) {
      expect(checkLongFiles(root, p, LIMIT, longFilePath)).toHaveLength(0);
    }
  });
});
