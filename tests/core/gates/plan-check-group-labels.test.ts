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

const MISSING_LABEL_FILE = sectionFile("tasks/04-missing-label.md");
const MISSING_LABEL_SECTION = [
  "Depends on: none",
  "",
  "- [ ] 4.1 [A] Write the failing test for group labels in `tests/core/gates/plan-check.test.ts`",
  "- [ ] 4.2 Run the test above and watch it fail before writing the check itself",
  "- [ ] 4.5 [reference] task text that opens with a bracketed word nine letters long",
  "",
].join("\n");

const DOUBLE_LABEL_FILE = sectionFile("tasks/04-double-label.md");
const DOUBLE_LABEL_SECTION = [
  "Depends on: none",
  "",
  "- [ ] 4.1 [A] Write the failing test for double-covered labels in `tests/core/gates/plan-check.test.ts`",
  "- [ ] 4.2 [A] Run the test above and watch it fail before writing the implementation",
  "- [ ] 4.3 [A] [B] Write the implementation that closes the failing test named above",
  "- [ ] 4.4 [B] Review the implementation and confirm the whole suite stays green",
  "",
].join("\n");

const NO_LABEL_ANYWHERE_FILE = sectionFile("tasks/10-no-label-anywhere.md");
const NO_LABEL_ANYWHERE_SECTION = [
  "Depends on: none",
  "",
  "- [ ] 10.1 Write something without any label at all, so the plan carries none.",
  "",
].join("\n");

describe("checkPlan: ярлыки группы задач", () => {
  it("задача без ярлыка, и задача с длинным словом в скобках вместо ярлыка, дают task-missing-group-label", () => {
    const root = groupsWorkspace([
      {
        heading: "## 4. Group labels missing",
        linkPath: "tasks/04-missing-label.md",
        body: MISSING_LABEL_SECTION,
      },
    ]);

    const result = checkPlan({ cwd: root, change: CHANGE });
    const findings = result.data.findings;

    expect(findings).toHaveLength(2);
    expect(findings.map((finding) => finding.rule)).toEqual([
      "task-missing-group-label",
      "task-missing-group-label",
    ]);
    expect(findings.map((finding) => finding.line)).toEqual([4, 5]);
    expect(findings.map((finding) => finding.file)).toEqual([
      MISSING_LABEL_FILE,
      MISSING_LABEL_FILE,
    ]);
    expect(findings[0]!.message).toContain("4.2");
    expect(findings[1]!.message).toContain("4.5");
    expect(result.exitCode).toBe(1);
  });

  it("задача с двумя ярлыками даёт section-group-coverage-mismatch, именующую секцию 4", () => {
    const root = groupsWorkspace([
      {
        heading: "## 4. Group label double covered",
        linkPath: "tasks/04-double-label.md",
        body: DOUBLE_LABEL_SECTION,
      },
    ]);

    const result = checkPlan({ cwd: root, change: CHANGE });
    const findings = result.data.findings;

    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("section-group-coverage-mismatch");
    expect(findings[0]!.line).toBe(5);
    expect(findings[0]!.file).toBe(DOUBLE_LABEL_FILE);
    expect(findings[0]!.message).toContain("4");
    expect(findings[0]!.message).toContain("4.3");
    expect(result.exitCode).toBe(1);
  });

  it("задача без ярлыка в плане без единого ярлыка тоже даёт task-missing-group-label", () => {
    const root = groupsWorkspace([
      {
        heading: "## 10. No labels anywhere in this plan",
        linkPath: "tasks/10-no-label-anywhere.md",
        body: NO_LABEL_ANYWHERE_SECTION,
      },
    ]);

    const result = checkPlan({ cwd: root, change: CHANGE });
    const findings = result.data.findings;

    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("task-missing-group-label");
    expect(findings[0]!.line).toBe(3);
    expect(findings[0]!.file).toBe(NO_LABEL_ANYWHERE_FILE);
    expect(findings[0]!.message).toContain("10.1");
    expect(result.exitCode).toBe(1);
  });
});
