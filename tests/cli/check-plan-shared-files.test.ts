import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { namedSectionFiles, splitPlanIntoIndex } from "../helpers/plan-index.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

/** A delta spec carrying one requirement per name given, for section-dependency fixtures. */
function specWithRequirements(names: string[]): string {
  const requirements = names.map(
    (name) =>
      `### Requirement: ${name}\n\nThe system SHALL do what "${name}" says.\n\n` +
      `#### Scenario: It happens\n\n- **WHEN** it is asked to\n- **THEN** it does\n`,
  );

  return `## Purpose\n\nHolds requirements the section-dependency fixtures point at.\n\n` +
    `## ADDED Requirements\n\n${requirements.join("\n")}`;
}

/**
 * Writes the fixture as the index form `section-tasks-inline` now requires:
 * `tasks.md` keeps each heading and a link, and the file that link points
 * at keeps the section's own `Depends on:` line and tasks, split out of
 * `tasks` (still written the old, flat way by every test below) by
 * `splitPlanIntoIndex`.
 */
function sectionsWorkspace(tasks: string, requirementNames: string[]): string {
  const { index, sections } = splitPlanIntoIndex(tasks);
  const root = makeWorkspace({
    "lexforge/config.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-auth/proposal.md": "## Why\n\nPasswords are stored in the open.\n",
    "lexforge/changes/add-auth/specs/auth/spec.md": specWithRequirements(requirementNames),
    "lexforge/changes/add-auth/design.md": "## Context\n\nOne service, one database.\n",
    "lexforge/changes/add-auth/tasks.md": index,
    ...namedSectionFiles("lexforge/changes/add-auth", sections),
  });
  created.push(root);
  return root;
}

function taskLine(number: string, file: string, requirement: string, groupLabel: string): string {
  return (
    `- [ ] ${number} [${groupLabel}] Carry out the work this task exists for, editing \`${file}\`.\n` +
    `      -> auth#${requirement}`
  );
}

interface SectionFinding {
  rule: string;
  line: number;
  message: string;
}

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

async function call(argv: string[], cwd: string) {
  const capture = createCapture();
  const exitCode = await run(argv, { cwd, stdout: capture.stdout, stderr: capture.stderr });
  return { exitCode, capture };
}

async function jsonFindings(root: string): Promise<SectionFinding[]> {
  const { capture } = await call(["check", "plan", "--change", "add-auth", "--json"], root);
  return (JSON.parse(capture.out) as { findings: SectionFinding[] }).findings;
}

function findingsOf(findings: SectionFinding[], rule: string): SectionFinding[] {
  return findings.filter((finding) => finding.rule === rule);
}

describe("lexforge check plan: два раздела none, общий файл", () => {
  it("оба «none» и один файл в задачах — код 1, называет обе строкой с обоими разделами и файлом", async () => {
    const tasks = [
      "## 4. First",
      "",
      "Depends on: none",
      "",
      taskLine("4.1", "src/shared.ts", "Req1", "A"),
      "",
      "## 6. Second",
      "",
      "Depends on: none",
      "",
      taskLine("6.1", "src/shared.ts", "Req2", "B"),
      "",
    ].join("\n");
    const root = sectionsWorkspace(tasks, ["Req1", "Req2"]);

    const { exitCode } = await call(["check", "plan", "--change", "add-auth"], root);
    const findings = await jsonFindings(root);
    const concurrent = findingsOf(findings, "section-concurrent-file");

    expect(exitCode).toBe(1);
    expect(concurrent).toHaveLength(1);
    // Section 6's own heading inside the index tasks.md — now line 5, since
    // the index carries only headings and links, not the tasks that used to
    // sit between section 4's heading and section 6's.
    expect(concurrent[0]!.line).toBe(5);
    expect(concurrent[0]!.message).toContain("Section 4 and section 6 are concurrent");
    expect(concurrent[0]!.message).toContain("src/shared.ts");
  });
});

describe("lexforge check plan: два раздела ждут один и тот же третий, общий файл", () => {
  it("оба ждут один и тот же раздел и делят файл — код 1, потому что он выпускает их разом", async () => {
    const tasks = [
      "## 9. Base",
      "",
      "Depends on: none",
      "",
      taskLine("9.1", "src/base.ts", "Req1", "A"),
      "",
      "## 4. First waiter",
      "",
      "Depends on: section 9",
      "",
      taskLine("4.1", "src/shared.ts", "Req2", "B"),
      "",
      "## 6. Second waiter",
      "",
      "Depends on: section 9",
      "",
      taskLine("6.1", "src/shared.ts", "Req3", "C"),
      "",
    ].join("\n");
    const root = sectionsWorkspace(tasks, ["Req1", "Req2", "Req3"]);

    const { exitCode } = await call(["check", "plan", "--change", "add-auth"], root);
    const findings = await jsonFindings(root);
    const concurrent = findingsOf(findings, "section-concurrent-file");

    expect(exitCode).toBe(1);
    expect(concurrent).toHaveLength(1);
    expect(concurrent[0]!.message).toContain("Section 4 and section 6 are concurrent");
    expect(concurrent[0]!.message).toContain("src/shared.ts");
  });
});

describe("lexforge check plan: цепочка зависимостей защищает общий файл", () => {
  it("6 ждёт 4, 4 ждёт 9, 9 и 6 делят файл — находки нет: 6 не начнётся раньше закрытия 9", async () => {
    const tasks = [
      "## 9. Base",
      "",
      "Depends on: none",
      "",
      taskLine("9.1", "src/shared.ts", "Req1", "A"),
      "",
      "## 4. Middle",
      "",
      "Depends on: section 9",
      "",
      taskLine("4.1", "src/middle.ts", "Req2", "B"),
      "",
      "## 6. Top",
      "",
      "Depends on: section 4",
      "",
      taskLine("6.1", "src/shared.ts", "Req3", "C"),
      "",
    ].join("\n");
    const root = sectionsWorkspace(tasks, ["Req1", "Req2", "Req3"]);

    const { exitCode } = await call(["check", "plan", "--change", "add-auth"], root);
    const findings = await jsonFindings(root);

    expect(exitCode).toBe(0);
    expect(findingsOf(findings, "section-concurrent-file")).toEqual([]);
  });
});

describe("lexforge check plan: направление проверки достижимости", () => {
  it("более ранний по тексту раздел ждёт более поздний — общий файл всё равно не даёт находки", async () => {
    const tasks = [
      "## 4. Earlier in the file, waits for the later one",
      "",
      "Depends on: section 6",
      "",
      taskLine("4.1", "src/shared.ts", "Req1", "A"),
      "",
      "## 6. Later in the file, the one waited for",
      "",
      "Depends on: none",
      "",
      taskLine("6.1", "src/shared.ts", "Req2", "B"),
      "",
    ].join("\n");
    const root = sectionsWorkspace(tasks, ["Req1", "Req2"]);

    const { exitCode } = await call(["check", "plan", "--change", "add-auth"], root);
    const findings = await jsonFindings(root);

    expect(exitCode).toBe(0);
    expect(findingsOf(findings, "section-concurrent-file")).toEqual([]);
  });
});

describe("lexforge check plan: сравнение файлов по краткому и полному имени", () => {
  it("полный путь в одном разделе и краткое имя того же файла в другом — конфликт находится", async () => {
    const tasks = [
      "## 4. First",
      "",
      "Depends on: none",
      "",
      taskLine("4.1", "src/core/gates/plan-check.ts", "Req1", "A"),
      "",
      "## 6. Second",
      "",
      "Depends on: none",
      "",
      taskLine("6.1", "plan-check.ts", "Req2", "B"),
      "",
    ].join("\n");
    const root = sectionsWorkspace(tasks, ["Req1", "Req2"]);

    const { exitCode } = await call(["check", "plan", "--change", "add-auth"], root);
    const findings = await jsonFindings(root);
    const concurrent = findingsOf(findings, "section-concurrent-file");

    expect(exitCode).toBe(1);
    expect(concurrent).toHaveLength(1);
    expect(concurrent[0]!.message).toContain("Section 4 and section 6 are concurrent");
  });

  it("два разных SKILL.md под разными каталогами не считаются одним файлом", async () => {
    const tasks = [
      "## 4. First",
      "",
      "Depends on: none",
      "",
      taskLine("4.1", "skills/lexforge-apply/SKILL.md", "Req1", "A"),
      "",
      "## 6. Second",
      "",
      "Depends on: none",
      "",
      taskLine("6.1", "skills/lexforge-verify/SKILL.md", "Req2", "B"),
      "",
    ].join("\n");
    const root = sectionsWorkspace(tasks, ["Req1", "Req2"]);

    const { exitCode } = await call(["check", "plan", "--change", "add-auth"], root);
    const findings = await jsonFindings(root);

    expect(exitCode).toBe(0);
    expect(findingsOf(findings, "section-concurrent-file")).toEqual([]);
  });

  it("каталог, названный с завершающим /, не считается файлом", async () => {
    const tasks = [
      "## 4. First",
      "",
      "Depends on: none",
      "",
      taskLine("4.1", "src/", "Req1", "A"),
      "",
      "## 6. Second",
      "",
      "Depends on: none",
      "",
      taskLine("6.1", "src/", "Req2", "B"),
      "",
    ].join("\n");
    const root = sectionsWorkspace(tasks, ["Req1", "Req2"]);

    const { exitCode } = await call(["check", "plan", "--change", "add-auth"], root);
    const findings = await jsonFindings(root);

    expect(exitCode).toBe(0);
    expect(findingsOf(findings, "section-concurrent-file")).toEqual([]);
  });
});
