import { afterEach, describe, expect, it } from "vitest";

import { checkPlan } from "../../../src/core/gates/plan-check.js";
import { checkMaterialReferences as check } from "../../../src/core/gates/plan-check-references.js";
import { parseTaskList } from "../../../src/core/gates/task-list.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const MARKER = "Check plan does not ask for the diagram or the mockup";

const login = {
  capability: "web",
  name: "Login screen",
  mockup: "mockups/login.html",
};
const both = { capability: "web", name: "Both kinds", interaction: true, mockup: "mockups/both.html" };
const second = { capability: "ingest", name: "Second flow", interaction: true };
const ingest = { capability: "ingest", name: "Ingest flow", interaction: true };
const plain = { capability: "web", name: "Plain page" };
const delta = { skipped: false, requirements: [login, ingest, plain, both, second] };

function plan(text: string) {
  return { file: "tasks.md", tasks: parseTaskList(`- [ ] 1.1 ${text}\n`, "tasks.md") };
}

function expectFindings(actual: unknown[], expected: number) {
  if (actual.length !== expected) console.error(MARKER);
  expect(actual).toHaveLength(expected);
}

describe("checkMaterialReferences", () => {
  it("reports a task that links a mockup requirement without naming the mockup", () => {
    const findings = check(plan("Build the form -> web#Login screen"), delta);

    expectFindings(findings, 1);
    expect(findings[0]).toMatchObject({ file: "tasks.md", line: 1, rule: "task-material-missing" });
    expect(findings[0]!.message).toContain("1.1");
    expect(findings[0]!.message).toContain("Login screen");
  });

  it("accepts the task that names the mockup path", () => {
    const findings = check(
      plan("Build the form from `specs/web/mockups/login.html` -> web#Login screen"),
      delta,
    );

    expectFindings(findings, 0);
  });

  it("reports an interaction requirement without the diagram anchor", () => {
    const findings = check(plan("Wire the flow -> ingest#Ingest flow"), delta);

    expectFindings(findings, 1);
    expect(findings[0]!.rule).toBe("task-material-missing");
    expect(findings[0]!.message).toContain("Ingest flow");
  });

  it("accepts the task that names the diagram anchor", () => {
    const findings = check(
      plan("Wire the flow per specs/ingest/spec.md#requirement-ingest-flow -> ingest#Ingest flow"),
      delta,
    );

    expectFindings(findings, 0);
  });

  it("ignores a requirement with neither line", () => {

    expectFindings(check(plan("Show the page -> web#Plain page"), delta), 0);
  });

  it("reports nothing for a skipped delta", () => {

    expectFindings(check(plan("Build -> web#Login screen"), { skipped: true, requirements: [] }), 0);
  });

  it("reports an interaction requirement whose task names the anchor of another requirement", () => {
    const findings = check(
      plan("Wire the flow per specs/ingest/spec.md#requirement-second-flow -> ingest#Ingest flow"),
      delta,
    );

    expectFindings(findings, 1);
  });

  it("accepts the anchor built from the requirement heading", () => {
    const findings = check(
      plan("Wire the flow per specs/ingest/spec.md#requirement-ingest-flow -> ingest#Ingest flow"),
      delta,
    );

    expectFindings(findings, 0);
  });

  it("asks each of two interaction requirements for its own anchor", () => {
    const tasks = parseTaskList(
      "- [ ] 1.1 Wire per specs/ingest/spec.md#requirement-ingest-flow\n      -> ingest#Ingest flow\n      -> ingest#Second flow\n",
      "tasks.md",
    );
    const findings = check({ file: "tasks.md", tasks }, delta);

    expectFindings(findings, 1);
    expect(findings[0]!.message).toContain("Second flow");
  });

  it("demands both references for a requirement with a mockup file and an interaction line", () => {
    const onlyMockup = check(
      plan("Build `specs/web/mockups/both.html` -> web#Both kinds"),
      delta,
    );
    const onlyAnchor = check(
      plan("Build specs/web/spec.md#requirement-both-kinds -> web#Both kinds"),
      delta,
    );
    const bothNamed = check(
      plan(
        "Build specs/web/mockups/both.html and specs/web/spec.md#requirement-both-kinds -> web#Both kinds",
      ),
      delta,
    );

    expectFindings(onlyMockup, 1);
    expectFindings(onlyAnchor, 1);
    expectFindings(bothNamed, 0);
  });
});

const SPEC = `## ADDED Requirements

### Requirement: Login screen

The system SHALL show a login form.

Mockup: mockups/login.html

#### Scenario: Form shown

- **WHEN** a user opens the page
- **THEN** the form is shown

## MODIFIED Requirements

### Requirement: Ingest flow

The system SHALL ingest files.

Interaction: file drop, progress, done.

#### Scenario: File ingested

- **WHEN** a file is dropped
- **THEN** it is ingested
`;

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) removeWorkspace(created.pop()!);
});

describe("checkPlan: material references from delta specs", () => {
  it("reads ADDED and MODIFIED requirements and reports tasks without the references", () => {
    const root = makeWorkspace({
      "lexforge/config.yaml": "schema: spec-driven\n",
      "lexforge/changes/add-ui/.lexforge.yaml": "schema: spec-driven\n",
      "lexforge/changes/add-ui/proposal.md": "## Why\n\nNo login.\n",
      "lexforge/changes/add-ui/specs/web/spec.md": SPEC,
      "lexforge/changes/add-ui/design.md": "## Context\n\nOne service.\n",
      "lexforge/changes/add-ui/tasks.md": "## 1. Screens\n`tasks/01-screens.md`\n",
      "lexforge/changes/add-ui/tasks/01-screens.md": [
        "Depends on: none",
        "",
        "- [ ] 1.1 [A] Write the login form in `src/login.ts`",
        "      -> web#Login screen",
        "- [ ] 1.2 [A] Write the ingest flow in `src/ingest.ts`",
        "      -> web#Ingest flow",
        "",
      ].join("\n"),
    });
    created.push(root);

    const findings = checkPlan({ cwd: root, change: "add-ui" }).data.findings.filter(
      (finding) => finding.rule === "task-material-missing",
    );

    expect(findings).toHaveLength(2);
    expect(findings.map((finding) => finding.message).join("\n")).toContain("Login screen");
    expect(findings.map((finding) => finding.message).join("\n")).toContain("Ingest flow");
  });
});
