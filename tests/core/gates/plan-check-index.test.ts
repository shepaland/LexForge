import { afterEach, describe, expect, it } from "vitest";

import { checkPlan } from "../../../src/core/gates/plan-check.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

/**
 * The index of a plan written as a file per section: two sections link out to
 * a file of their own, the third keeps its `Depends on:` line and its task
 * inline, the way a section without a link of its own still parses.
 */
const INDEX_PLAN = [
  "## 1. Раздел с задачей-плейсхолдером",
  "`tasks/01-first.md`",
  "",
  "## 2. Раздел с повторным Depends on",
  "`tasks/02-second.md`",
  "",
  "## 3. Раздел с неизвестной зависимостью",
  "`tasks/03-third.md`",
  "",
  "## 4. Первый узел цикла",
  "`tasks/04-fourth.md`",
  "",
  "## 5. Второй узел цикла",
  "`tasks/05-fifth.md`",
  "",
].join("\n");

/** Section 1's own file: a task naming a placeholder marker. */
const INDEX_FIRST_SECTION = [
  "Depends on: none",
  "",
  "- [ ] 1.1 [A] Написать срок жизни сессии и оставить TODO на продление",
  "",
].join("\n");

/** Section 2's own file: the same `Depends on:` line written twice. */
const INDEX_SECOND_SECTION = [
  "Depends on: section 1",
  "Depends on: section 1",
  "",
  "- [ ] 2.1 [A] Написать срок жизни сессии в `src/two.ts`",
  "",
].join("\n");

/** Section 3's own file: a `Depends on:` line naming a section the plan has no heading for. */
const INDEX_THIRD_SECTION = [
  "Depends on: section 99",
  "",
  "- [ ] 3.1 [A] Написать запись входа в журнал в `src/three.ts`",
  "",
].join("\n");

/** Section 4's own file: the first half of a two-section dependency cycle. */
const INDEX_FOURTH_SECTION = [
  "Depends on: section 5",
  "",
  "- [ ] 4.1 [A] Написать шаг A в `src/four.ts`",
  "",
].join("\n");

/** Section 5's own file: the second half of the cycle, closing it back onto section 4. */
const INDEX_FIFTH_SECTION = [
  "Depends on: section 4",
  "",
  "- [ ] 5.1 [A] Написать шаг B в `src/five.ts`",
  "",
].join("\n");

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

describe("checkPlan: план как индекс", () => {
  it("задача, повторная строка Depends on, неизвестная зависимость и цикл называют файл своего раздела, а не файл индекса", () => {
    const root = makeWorkspace({
      "lexforge/config.yaml": "schema: spec-driven\n",
      "lexforge/changes/add-index/.lexforge.yaml": "schema: spec-driven\nskip_specs: true\n",
      "lexforge/changes/add-index/proposal.md": "## Why\n\nThe plan of a change grows too long for one file.\n",
      "lexforge/changes/add-index/design.md": "## Context\n\nOne file per section, linked from an index.\n",
      "lexforge/changes/add-index/tasks.md": INDEX_PLAN,
      "lexforge/changes/add-index/tasks/01-first.md": INDEX_FIRST_SECTION,
      "lexforge/changes/add-index/tasks/02-second.md": INDEX_SECOND_SECTION,
      "lexforge/changes/add-index/tasks/03-third.md": INDEX_THIRD_SECTION,
      "lexforge/changes/add-index/tasks/04-fourth.md": INDEX_FOURTH_SECTION,
      "lexforge/changes/add-index/tasks/05-fifth.md": INDEX_FIFTH_SECTION,
    });
    created.push(root);

    const FIRST_FILE = "lexforge/changes/add-index/tasks/01-first.md";
    const SECOND_FILE = "lexforge/changes/add-index/tasks/02-second.md";
    const THIRD_FILE = "lexforge/changes/add-index/tasks/03-third.md";
    const FIFTH_FILE = "lexforge/changes/add-index/tasks/05-fifth.md";

    const findings = checkPlan({ cwd: root, change: "add-index" }).data.findings;

    const placeholder = findings.find((finding) => finding.rule === "task-placeholder");
    expect(placeholder?.file).toBe(FIRST_FILE);

    const repeated = findings.find((finding) => finding.rule === "section-depends-on-repeated");
    expect(repeated?.file).toBe(SECOND_FILE);

    const unknown = findings.find((finding) => finding.rule === "section-unknown-dependency");
    expect(unknown?.file).toBe(THIRD_FILE);

    const cycle = findings.find((finding) => finding.rule === "section-dependency-cycle");
    expect(cycle?.file).toBe(FIFTH_FILE);
  });
});
