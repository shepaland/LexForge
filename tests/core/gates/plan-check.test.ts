import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import { answerPath } from "../../../src/core/answer-path.js";
import { checkPlan } from "../../../src/core/gates/plan-check.js";
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

/** A plan with three violations: coverage, placeholder, identifier spelling. */
const THREE_FAULTS = [
  "## 1. Вход",
  "",
  "- [ ] 1.1 Написать хранение пароля в виде хеша в `src/auth/store.ts`",
  "      -> auth#Password is stored hashed",
  "- [ ] 1.2 Написать срок жизни сессии и оставить TODO на продление",
  "      -> auth#Session expires",
  "- [ ] 1.3 Написать поле `resolvedOutputPath` в записи журнала входа",
  "- [ ] 1.4 Прочитать `resolved_output_path` при выводе журнала входа",
  "",
].join("\n");

/** A plan that covers every requirement and breaks no rule. */
const CLEAN = [
  "## 1. Вход",
  "",
  "- [ ] 1.1 Написать хранение пароля в виде хеша в `src/auth/store.ts`",
  "      -> auth#Password is stored hashed",
  "- [ ] 1.2 Написать срок жизни сессии в `src/auth/session.ts`",
  "      -> auth#Session expires",
  "- [ ] 1.3 Написать запись входа в журнал в `src/audit/log.ts`",
  "      -> audit#Sign-in is written to the audit log",
  "",
].join("\n");

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

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

describe("checkPlan: находки трёх наборов правил", () => {
  it("три нарушения дают три находки по возрастанию строки с путём к плану", () => {
    const root = workspace(THREE_FAULTS);

    const result = checkPlan({ cwd: root, change: "add-auth" });
    const findings = result.data.findings;

    expect(findings).toHaveLength(3);
    expect(findings.map((finding) => finding.line)).toEqual([1, 5, 7]);
    expect(findings.map((finding) => finding.rule)).toEqual([
      "requirement-not-planned",
      "task-placeholder",
      "identifier-spelling",
    ]);
    expect(findings.map((finding) => finding.file)).toEqual([PLAN_FILE, PLAN_FILE, PLAN_FILE]);
    expect(result.exitCode).toBe(1);
  });

  it("чистый план не даёт находок и завершается кодом 0", () => {
    const root = workspace(CLEAN);

    const result = checkPlan({ cwd: root, change: "add-auth" });

    expect(result.data.findings).toEqual([]);
    expect(result.exitCode).toBe(0);
    expect(result.data.change).toBe("add-auth");
    expect(result.data.workspaceRoot).toBe(answerPath(root));
    expect(result.data.outputVersion).toBe(1);
  });
});

describe("checkPlan: счётчики по измерениям", () => {
  it("сумма счётчиков равна длине списка находок", () => {
    const root = workspace(THREE_FAULTS);

    const { summary, findings } = checkPlan({ cwd: root, change: "add-auth" }).data;

    expect(summary).toEqual({ placeholders: 1, coverage: 1, identifiers: 1 });
    expect(summary.placeholders + summary.coverage + summary.identifiers).toBe(findings.length);
  });
});

describe("checkPlan: плана нет", () => {
  it("ненаписанный tasks.md даёт UsageError с кодом artifact-missing", () => {
    const root = workspace("");

    let error: unknown;
    try {
      checkPlan({ cwd: root, change: "add-auth" });
    } catch (thrown) {
      error = thrown;
    }

    expect(error).toBeInstanceOf(UsageError);
    expect((error as UsageError).code).toBe("artifact-missing");
    expect((error as UsageError).message + (error as UsageError).nextStep).toContain(
      "lexforge instructions tasks --change add-auth",
    );
  });
});
