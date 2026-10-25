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

function taskLine(number: string, file: string, requirement: string): string {
  return (
    `- [ ] ${number} Carry out the work this task exists for, editing \`${file}\`.\n` +
    `      -> auth#${requirement}\n` +
    `      Files: \`${file}\`\n` +
    `      Test: \`tests/t${number}.test.ts\`\n` +
    "      Command: `npm test`"
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

describe("lexforge check plan: общий файл у разделов", () => {
  const sections = (secondDepends: string): string =>
    [
      "## 1. First",
      "",
      "Depends on: none",
      "",
      taskLine("1.1", "src/shared.ts", "A"),
      "",
      "## 2. Second",
      "",
      `Depends on: ${secondDepends}`,
      "",
      taskLine("2.1", "src/shared.ts", "B"),
      "",
    ].join("\n");

  it("оба раздела none и один файл в задачах: код 1, находка называет обе задачи и файл", async () => {
    const root = sectionsWorkspace(sections("none"), ["A", "B"]);
    const { exitCode } = await call(["check", "plan", "--change", "add-auth"], root);
    const found = findingsOf(await jsonFindings(root), "shared-file-without-order");

    expect(exitCode).toBe(1);
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("2.1");
    expect(found[0]!.message).toContain("1.1");
    expect(found[0]!.message).toContain("src/shared.ts");
  });

  it("второй раздел ждёт первый: находки нет и код 0", async () => {
    const root = sectionsWorkspace(sections("1"), ["A", "B"]);
    const { exitCode } = await call(["check", "plan", "--change", "add-auth"], root);

    expect(await jsonFindings(root)).toEqual([]);
    expect(exitCode).toBe(0);
  });

  it("цепочка через третий раздел защищает общий файл", async () => {
    const tasks = [
      "## 1. First", "", "Depends on: none", "", taskLine("1.1", "src/shared.ts", "A"), "",
      "## 2. Middle", "", "Depends on: 1", "", taskLine("2.1", "src/middle.ts", "B"), "",
      "## 3. Last", "", "Depends on: 2", "", taskLine("3.1", "src/shared.ts", "A"), "",
    ].join("\n");
    const root = sectionsWorkspace(tasks, ["A", "B"]);

    expect(await jsonFindings(root)).toEqual([]);
  });
});
