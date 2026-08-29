import { afterEach, describe, expect, it } from "vitest";

import type { Finding } from "../../../src/core/validation/finding.js";
import { validateChange } from "../../../src/core/validation/validate-change.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const created: string[] = [];

const REQUIREMENTS = `## ADDED Requirements

### Requirement: Change carries a delta spec

The system SHALL read the delta spec of the change.

#### Scenario: Delta spec is written

- **WHEN** the change directory holds one spec file
- **THEN** the scanner reports one requirement
`;

const SHORT_PURPOSE = `## Purpose

Short purpose here.

${REQUIREMENTS}`;

const LONG_PURPOSE = `## Purpose

Reads the delta spec of a change and reports what the scanner finds in it.

${REQUIREMENTS}`;

const PROPOSAL_WITH_COMMENT = `## Why

<!-- One or two paragraphs: what is broken today and what it costs. -->

Passwords are stored in the open.
`;

const PROPOSAL_WITH_PLACEHOLDER = `## Why

Passwords are stored in the open.

## Capabilities

- <capability-path>: what the capability does
`;

const PROPOSAL_WITH_COMMAND = `## Why

Passwords are stored in the open.
A change starts with \`lexforge new change <name>\`.
`;

function change(files: Record<string, string> = {}): Record<string, string> {
  return {
    "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-auth/proposal.md": "## Why\n\nPasswords are stored in the open.\n",
    "lexforge/changes/add-auth/specs/auth/spec.md": LONG_PURPOSE,
    "lexforge/changes/add-auth/design.md": "## Context\n\nOne service, one database.\n",
    "lexforge/changes/add-auth/tasks.md": "## 1. Login\n\n- [ ] 1.1 Write the failing test\n",
    ...files,
  };
}

function workspace(files: Record<string, string>): string {
  const root = makeWorkspace({ "lexforge/config.yaml": "schema: spec-driven\n", ...files });
  created.push(root);
  return root;
}

function findingsFor(files: Record<string, string>, strict: boolean): Finding[] {
  return validateChange({ cwd: workspace(files), change: "add-auth", strict }).data.findings;
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

describe("строгий режим: длина раздела Purpose", () => {
  const files = change({ "lexforge/changes/add-auth/specs/auth/spec.md": SHORT_PURPOSE });

  it("короткий Purpose даёт находку purpose-too-short с требуемой длиной", () => {
    const finding = findingsFor(files, true).find(
      (candidate) => candidate.rule === "purpose-too-short",
    );

    expect(finding).toBeDefined();
    expect(finding!.message).toContain("50");
    expect(finding!.file).toBe("lexforge/changes/add-auth/specs/auth/spec.md");
    expect(finding!.line).toBe(1);
  });

  it("без строгого режима та же дельта находок не даёт", () => {
    expect(findingsFor(files, false)).toEqual([]);
  });

  it("длинный Purpose находок не даёт и в строгом режиме", () => {
    expect(findingsFor(change(), true)).toEqual([]);
  });
});

describe("строгий режим: остатки шаблона", () => {
  const withComment = change({
    "lexforge/changes/add-auth/proposal.md": PROPOSAL_WITH_COMMENT,
  });

  it("сохранившийся комментарий даёт находку с номером строки", () => {
    const finding = findingsFor(withComment, true).find(
      (candidate) => candidate.rule === "template-placeholder-left",
    );

    expect(finding).toBeDefined();
    expect(finding!.file).toBe("lexforge/changes/add-auth/proposal.md");
    expect(finding!.line).toBe(3);
  });

  it("без строгого режима комментарий находкой не считается", () => {
    expect(findingsFor(withComment, false)).toEqual([]);
  });

  it("угловой заполнитель даёт ту же находку", () => {
    const findings = findingsFor(
      change({ "lexforge/changes/add-auth/proposal.md": PROPOSAL_WITH_PLACEHOLDER }),
      true,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("template-placeholder-left");
    expect(findings[0]!.line).toBe(7);
  });

  it("команда в обратных кавычках находкой не считается", () => {
    expect(
      findingsFor(change({ "lexforge/changes/add-auth/proposal.md": PROPOSAL_WITH_COMMAND }), true),
    ).toEqual([]);
  });
});

describe("строгий режим: полнота артефактов", () => {
  function withoutTasks(): Record<string, string> {
    const files = change();
    delete files["lexforge/changes/add-auth/tasks.md"];
    return files;
  }

  it("ненаписанный артефакт даёт находку artifact-not-done с его именем", () => {
    const findings = findingsFor(withoutTasks(), true);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("artifact-not-done");
    expect(findings[0]!.message).toContain("tasks");
    expect(findings[0]!.file).toBe("lexforge/changes/add-auth/tasks.md");
  });

  it("без строгого режима ненаписанный артефакт находкой не считается", () => {
    expect(findingsFor(withoutTasks(), false)).toEqual([]);
  });

  it("все артефакты в done или skipped находки не дают", () => {
    const files = change({
      "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\nskip_design: true\n",
    });
    delete files["lexforge/changes/add-auth/design.md"];

    expect(findingsFor(files, true)).toEqual([]);
  });
});
