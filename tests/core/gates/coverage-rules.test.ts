import { afterEach, describe, expect, it } from "vitest";

import { checkCoverage, readDeltaSpecs } from "../../../src/core/gates/coverage-rules.js";
import { parseTaskList, type PlanTasks } from "../../../src/core/gates/task-list.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const PLAN_FILE = "lexforge/changes/add-auth/tasks.md";

const AUTH_SPEC = `## Purpose

Holds what the sign-in of the product does and what it refuses to do.

## ADDED Requirements

### Requirement: Password is stored hashed

The system SHALL store a password as a hash.

#### Scenario: A password is saved

- **WHEN** a user sets a password
- **THEN** the store holds a hash of it

### Requirement: Session expires

The system SHALL end a session after an hour.

#### Scenario: An hour has passed

- **WHEN** an hour has passed since sign-in
- **THEN** the session is over
`;

const AUDIT_SPEC = `## Purpose

Holds what the product writes down about who signed in and when.

## ADDED Requirements

### Requirement: Sign-in is written to the audit log

The system SHALL write every sign-in to the audit log.

#### Scenario: A user signs in

- **WHEN** a user signs in
- **THEN** the audit log holds a line about it
`;

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

/** A project with one change, two delta specs and the given plan. */
function workspace(tasks: string, files: Record<string, string> = {}): string {
  const root = makeWorkspace({
    "lexforge/config.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-auth/proposal.md": "## Why\n\nPasswords are stored in the open.\n",
    "lexforge/changes/add-auth/specs/auth/spec.md": AUTH_SPEC,
    "lexforge/changes/add-auth/specs/audit/spec.md": AUDIT_SPEC,
    "lexforge/changes/add-auth/design.md": "## Context\n\nOne service, one database.\n",
    "lexforge/changes/add-auth/tasks.md": tasks,
    ...files,
  });
  created.push(root);
  return root;
}

function plan(tasks: string): PlanTasks {
  return { file: PLAN_FILE, tasks: parseTaskList(tasks) };
}

describe("checkCoverage: требование без задачи", () => {
  it("при трёх требованиях и ссылках на два выходит одна находка", () => {
    const tasks = [
      "- [ ] 1.1 Написать хранение пароля в виде хеша в `src/auth/store.ts`",
      "      -> auth#Password is stored hashed",
      "- [ ] 1.2 Написать запись входа в журнал в `src/audit/log.ts`",
      "      -> audit#Sign-in is written to the audit log",
    ].join("\n");
    const root = workspace(tasks);

    const findings = checkCoverage(plan(tasks), readDeltaSpecs(root, "add-auth"));

    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("requirement-not-planned");
    expect(findings[0]!.file).toBe(PLAN_FILE);
    expect(findings[0]!.level).toBe("error");
    expect(findings[0]!.message).toContain("Session expires");
    expect(findings[0]!.message).toContain("auth");
  });
});

describe("checkCoverage: ссылка на несуществующее требование", () => {
  it("находка несёт номер строки задачи и имена требований этой capability", () => {
    const tasks = [
      "## 1. Вход",
      "",
      "- [ ] 1.1 Написать хранение пароля в виде хеша в `src/auth/store.ts`",
      "      -> auth#Password is stored hashed",
      "- [ ] 1.2 Написать срок жизни сессии в `src/auth/session.ts`",
      "      -> auth#Session expiers",
      "- [ ] 1.3 Написать запись входа в журнал в `src/audit/log.ts`",
      "      -> audit#Sign-in is written to the audit log",
    ].join("\n");
    const root = workspace(tasks);

    const findings = checkCoverage(plan(tasks), readDeltaSpecs(root, "add-auth"));
    const unknown = findings.filter((finding) => finding.rule === "requirement-link-unknown");

    expect(unknown).toHaveLength(1);
    expect(unknown[0]!.line).toBe(5);
    expect(unknown[0]!.message).toContain("Session expiers");
    expect(unknown[0]!.message).toContain("Password is stored hashed");
    expect(unknown[0]!.message).toContain("Session expires");
  });
});

describe("checkCoverage: пропущенная дельта", () => {
  it("change с дельта-спеками в статусе skipped находок покрытия не даёт", () => {
    const tasks = "- [ ] 1.1 Переименовать `src/auth/store.ts` в `src/auth/password.ts`\n";
    const root = workspace(tasks, {
      "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\nskip_specs: true\n",
    });

    const delta = readDeltaSpecs(root, "add-auth");

    expect(delta.skipped).toBe(true);
    expect(checkCoverage(plan(tasks), delta)).toEqual([]);
  });
});
