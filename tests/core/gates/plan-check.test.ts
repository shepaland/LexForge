import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import { answerPath } from "../../../src/core/answer-path.js";
import { checkPlan } from "../../../src/core/gates/plan-check.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const PLAN_FILE = "lexforge/changes/add-auth/tasks.md";
const SECTION_FILE = "lexforge/changes/add-auth/tasks/01-vhod.md";

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

/**
 * The index naming `THREE_FAULTS_SECTION`'s file. One section, one link -
 * `checkPlan` reads the section's own tasks off the linked file, not off
 * this index, so a fixture built for the placeholder, coverage and
 * identifier rules stays clear of the index-shape rule tested below.
 */
const THREE_FAULTS = ["## 1. Вход", "`tasks/01-vhod.md`", ""].join("\n");

/**
 * `THREE_FAULTS`'s own section file: three violations - coverage,
 * placeholder, identifier spelling. Every task carries the label `[A]` so
 * the unconditional group-label check stays out of a fixture built to test
 * other rules.
 */
const THREE_FAULTS_SECTION = [
  "Depends on: none",
  "",
  "- [ ] 1.1 [A] Написать хранение пароля в виде хеша в `src/auth/store.ts`",
  "      -> auth#Password is stored hashed",
  "- [ ] 1.2 [A] Написать срок жизни сессии и оставить TODO на продление",
  "      -> auth#Session expires",
  "- [ ] 1.3 [A] Написать поле `resolvedOutputPath` в записи журнала входа",
  "- [ ] 1.4 [A] Прочитать `resolved_output_path` при выводе журнала входа",
  "",
].join("\n");

/** The index naming `CLEAN_SECTION`'s file. */
const CLEAN = ["## 1. Вход", "`tasks/01-vhod.md`", ""].join("\n");

/**
 * `CLEAN`'s own section file: covers every requirement and breaks no rule.
 * Every task carries the label `[A]`, for the same reason as
 * `THREE_FAULTS_SECTION` above.
 */
const CLEAN_SECTION = [
  "Depends on: none",
  "",
  "- [ ] 1.1 [A] Написать хранение пароля в виде хеша в `src/auth/store.ts`",
  "      -> auth#Password is stored hashed",
  "- [ ] 1.2 [A] Написать срок жизни сессии в `src/auth/session.ts`",
  "      -> auth#Session expires",
  "- [ ] 1.3 [A] Написать запись входа в журнал в `src/audit/log.ts`",
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
    const root = workspace(THREE_FAULTS, {
      "lexforge/changes/add-auth/tasks/01-vhod.md": THREE_FAULTS_SECTION,
    });

    const result = checkPlan({ cwd: root, change: "add-auth" });
    const findings = result.data.findings;

    expect(findings).toHaveLength(3);
    expect(findings.map((finding) => finding.line)).toEqual([1, 5, 7]);
    expect(findings.map((finding) => finding.rule)).toEqual([
      "requirement-not-planned",
      "task-placeholder",
      "identifier-spelling",
    ]);
    expect(findings.map((finding) => finding.file)).toEqual([PLAN_FILE, SECTION_FILE, SECTION_FILE]);
    expect(result.exitCode).toBe(1);
  });

  it("чистый план не даёт находок и завершается кодом 0", () => {
    const root = workspace(CLEAN, {
      "lexforge/changes/add-auth/tasks/01-vhod.md": CLEAN_SECTION,
    });

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
    const root = workspace(THREE_FAULTS, {
      "lexforge/changes/add-auth/tasks/01-vhod.md": THREE_FAULTS_SECTION,
    });

    const { summary, findings } = checkPlan({ cwd: root, change: "add-auth" }).data;

    expect(summary).toEqual({ placeholders: 1, coverage: 1, identifiers: 1, sections: 0 });
    expect(summary.placeholders + summary.coverage + summary.identifiers + summary.sections).toBe(
      findings.length,
    );
  });
});

/**
 * A minimal workspace for one change: config, `.lexforge.yaml` with
 * `skip_specs: true` (the index-shape rule has nothing to do with delta
 * coverage), a proposal and a design, `tasksMd` as `tasks.md`, and any
 * further files - a section's own linked file, typically.
 */
function indexWorkspace(change: string, tasksMd: string, files: Record<string, string> = {}): string {
  const root = makeWorkspace({
    "lexforge/config.yaml": "schema: spec-driven\n",
    [`lexforge/changes/${change}/.lexforge.yaml`]: "schema: spec-driven\nskip_specs: true\n",
    [`lexforge/changes/${change}/proposal.md`]: "## Why\n\nFixture for the index-shape rule.\n",
    [`lexforge/changes/${change}/design.md`]: "## Context\n\nFixture for the index-shape rule.\n",
    [`lexforge/changes/${change}/tasks.md`]: tasksMd,
    ...files,
  });
  created.push(root);
  return root;
}

describe("checkPlan: раздел с задачами внутри индекса", () => {
  it("раздел без ссылки держит задачи прямо в tasks.md и даёт находку, называющую tasks.md", () => {
    const root = indexWorkspace(
      "inline-section",
      [
        "## 1. Раздел со своим файлом",
        "`tasks/01-first.md`",
        "",
        "## 2. Раздел без ссылки",
        "",
        "Depends on: none",
        "",
        "- [ ] 2.1 [A] Написать шаг в `src/two.ts`",
        "",
      ].join("\n"),
      {
        "lexforge/changes/inline-section/tasks/01-first.md":
          "Depends on: none\n\n- [ ] 1.1 [A] Написать шаг в `src/one.ts`\n",
      },
    );

    const findings = checkPlan({ cwd: root, change: "inline-section" }).data.findings;
    const finding = findings.find((item) => item.rule === "section-tasks-inline");

    expect(finding?.file).toBe("lexforge/changes/inline-section/tasks.md");
    expect(finding?.message).toMatch(/tasks\.md/);
    expect(checkPlan({ cwd: root, change: "inline-section" }).exitCode).toBe(1);
  });

  it("план из одного раздела не получает исключения по размеру", () => {
    const root = indexWorkspace(
      "one-section",
      [
        "## 1. Единственный раздел",
        "",
        "Depends on: none",
        "",
        "- [ ] 1.1 [A] Написать шаг в `src/only.ts`",
        "",
      ].join("\n"),
    );

    const findings = checkPlan({ cwd: root, change: "one-section" }).data.findings;
    const finding = findings.find((item) => item.rule === "section-tasks-inline");

    expect(finding).toBeDefined();
    expect(finding?.file).toBe("lexforge/changes/one-section/tasks.md");
  });

  it("раздел со ссылкой, который всё ещё держит Depends on и задачу за ссылкой, называет сам раздел", () => {
    const root = indexWorkspace(
      "hybrid-section",
      [
        "## 1. Раздел со ссылкой и хвостом",
        "`tasks/01-first.md`",
        "",
        "Depends on: none",
        "",
        "- [ ] 1.99 [A] Задача, оставленная за ссылкой в `src/leftover.ts`",
        "",
      ].join("\n"),
      {
        "lexforge/changes/hybrid-section/tasks/01-first.md":
          "Depends on: none\n\n- [ ] 1.1 [A] Написать шаг в `src/one.ts`\n",
      },
    );

    const findings = checkPlan({ cwd: root, change: "hybrid-section" }).data.findings;
    const finding = findings.find((item) => item.rule === "section-tasks-inline");

    expect(finding).toBeDefined();
    expect(finding?.file).toBe("lexforge/changes/hybrid-section/tasks.md");
    expect(finding?.message).toContain("Depends on");
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
