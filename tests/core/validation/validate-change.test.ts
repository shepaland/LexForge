import { afterEach, describe, expect, it } from "vitest";

import { validateChange } from "../../../src/core/validation/validate-change.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const created: string[] = [];

const VALID_SPEC = `## Purpose

Reads the delta spec of a change and reports what the scanner finds in it.

## ADDED Requirements

### Requirement: Change carries a delta spec

The system SHALL read the delta spec of the change.

#### Scenario: Delta spec is written

- **WHEN** the change directory holds one spec file
- **THEN** the scanner reports one requirement
`;

const CLEAN_CHANGE: Record<string, string> = {
  "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
  "lexforge/changes/add-auth/proposal.md": "## Why\n\nPasswords are stored in the open.\n",
  "lexforge/changes/add-auth/specs/auth/spec.md": VALID_SPEC,
  "lexforge/changes/add-auth/design.md": "## Context\n\nOne service, one database.\n",
  "lexforge/changes/add-auth/tasks.md": "## 1. Login\n\n- [ ] 1.1 Write the failing test\n",
};

function workspace(files: Record<string, string> = {}): string {
  const root = makeWorkspace({
    "lexforge/config.yaml": "schema: spec-driven\n",
    ...files,
  });
  created.push(root);
  return root;
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

const EMPTY_REQUIREMENT = `## Purpose

Keeps a requirement that nobody wrote a scenario for.

## ADDED Requirements

### Requirement: Empty requirement
`;

const CHANGE_WITHOUT_SPECS: Record<string, string> = {
  "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
  "lexforge/changes/add-auth/proposal.md": "## Why\n\nPasswords are stored in the open.\n",
  "lexforge/changes/add-auth/specs/": "",
  "lexforge/changes/add-auth/design.md": "## Context\n\nOne service, one database.\n",
  "lexforge/changes/add-auth/tasks.md": "## 1. Login\n\n- [ ] 1.1 Write the failing test\n",
};

const SCENARIO_WITHOUT_RESULT = `## Purpose

Keeps a scenario that names a condition and stops there.

## ADDED Requirements

### Requirement: Result is missing

The system SHALL answer the caller.

#### Scenario: No result

- **WHEN** the caller asks
`;

describe("validateChange на чистом change", () => {
  it("не находит нарушений и завершается кодом 0", () => {
    const root = workspace(CLEAN_CHANGE);

    const result = validateChange({ cwd: root, change: "add-auth" });

    expect(result.data.findings).toEqual([]);
    expect(result.data.summary).toEqual({ errors: 0, warnings: 0 });
    expect(result.data.target).toBe("add-auth");
    expect(result.data.strict).toBe(false);
    expect(result.exitCode).toBe(0);
  });

  it("несёт поля из решения 10 и ничего сверх них", () => {
    const root = workspace(CLEAN_CHANGE);

    const result = validateChange({ cwd: root, change: "add-auth" });

    expect(Object.keys(result.data)).toEqual([
      "outputVersion",
      "target",
      "strict",
      "findings",
      "summary",
      "nextStep",
    ]);
    expect(result.data.outputVersion).toBe(1);
  });
});

describe("validateChange на нарушении в дельта-спеке", () => {
  it("даёт код 1 и одну находку с путём от корня рабочего пространства", () => {
    const root = workspace({
      ...CLEAN_CHANGE,
      "lexforge/changes/add-auth/specs/auth/spec.md": EMPTY_REQUIREMENT,
    });

    const result = validateChange({ cwd: root, change: "add-auth" });

    expect(result.exitCode).toBe(1);
    expect(result.data.summary).toEqual({ errors: 1, warnings: 0 });
    expect(result.data.findings).toHaveLength(1);

    const finding = result.data.findings[0]!;
    expect(finding.rule).toBe("requirement-without-scenario");
    expect(finding.level).toBe("error");
    expect(finding.file).toBe("lexforge/changes/add-auth/specs/auth/spec.md");
    expect(finding.line).toBe(7);
  });
});

describe("validateChange на нулевой дельте", () => {
  it("пустой каталог спек без объявленного пропуска даёт находку empty-delta", () => {
    const root = workspace(CHANGE_WITHOUT_SPECS);

    const result = validateChange({ cwd: root, change: "add-auth" });

    expect(result.exitCode).toBe(1);

    const finding = result.data.findings.find((candidate) => candidate.rule === "empty-delta");
    expect(finding).toBeDefined();
    expect(finding!.message).toContain("skip_specs: true");
    expect(finding!.message).toContain("invent");
    expect(finding!.file).toBe("lexforge/changes/add-auth/.lexforge.yaml");
  });

  it("объявленный пропуск снимает находку и даёт код 0", () => {
    const root = workspace({
      ...CHANGE_WITHOUT_SPECS,
      "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\nskip_specs: true\n",
    });

    const result = validateChange({ cwd: root, change: "add-auth" });

    expect(result.data.findings).toEqual([]);
    expect(result.exitCode).toBe(0);
  });
});

describe("человеческий вывод validateChange", () => {
  it("группирует находки по файлам: заголовок с путём, под ним строки находок", () => {
    const root = workspace({
      ...CLEAN_CHANGE,
      "lexforge/changes/add-auth/specs/auth/spec.md": EMPTY_REQUIREMENT,
      "lexforge/changes/add-auth/specs/profile/spec.md": SCENARIO_WITHOUT_RESULT,
    });

    const result = validateChange({ cwd: root, change: "add-auth" });

    expect(result.lines[0]).toBe("lexforge/changes/add-auth/specs/auth/spec.md");
    expect(result.lines[1]!.startsWith(" ")).toBe(true);
    expect(result.lines[1]!.trim()).toMatch(
      /^7 {2}error {2}requirement-without-scenario {2}\S/,
    );
    expect(result.lines[2]).toBe("lexforge/changes/add-auth/specs/profile/spec.md");
    expect(result.lines[3]!.trim()).toMatch(/^11 {2}error {2}scenario-without-then {2}\S/);
    expect(result.lines).toHaveLength(4);
  });

  it("следующим шагом зовёт исправить находки и запустить проверку снова", () => {
    const root = workspace({
      ...CLEAN_CHANGE,
      "lexforge/changes/add-auth/specs/auth/spec.md": EMPTY_REQUIREMENT,
    });

    const result = validateChange({ cwd: root, change: "add-auth" });

    expect(result.nextStep).toContain("lexforge validate add-auth");
    expect(result.data.nextStep).toBe(result.nextStep);
  });
});
