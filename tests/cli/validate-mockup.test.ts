import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const created: string[] = [];

const SPEC = `## Purpose

Lets a visitor sign in to the web client with an email address.

## ADDED Requirements

### Requirement: Visitor signs in

The system SHALL show a sign-in screen.

Mockup: mockups/login.html

#### Scenario: Screen is shown

- **WHEN** the visitor opens the login page
- **THEN** the sign-in form is shown
`;

const HTML = `<html><head>
<link rel="stylesheet" href="login.css">
</head><body>
<div class="btn">Sign in</div>
</body></html>
`;

function workspace(): string {
  const dir = "lexforge/changes/add-login";
  const root = makeWorkspace({
    "lexforge/config.yaml": "schema: spec-driven\n",
    "src/app.css": ".btn { color: red; }\n",
    [`${dir}/.lexforge.yaml`]: "schema: spec-driven\n",
    [`${dir}/proposal.md`]: "## Why\n\nVisitors cannot sign in.\n",
    [`${dir}/specs/web/spec.md`]: SPEC,
    [`${dir}/specs/web/mockups/login.html`]: HTML,
    [`${dir}/specs/web/mockups/login.css`]: ".btn { color: blue; }\n",
    [`${dir}/design.md`]: "## Context\n\nOne web client.\n",
    [`${dir}/tasks.md`]: "## 1. Login\n\n- [ ] 1.1 Write the failing test\n",
  });
  created.push(root);
  return root;
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

interface Report {
  findings: { rule: string; message: string }[];
}

describe("lexforge validate on a change with an HTML mockup", () => {
  it("strict mode exits 1 with ui-styles-missing naming ui.styles", async () => {
    const capture = createCapture();
    const exitCode = await run(["validate", "add-login", "--strict", "--json"], {
      cwd: workspace(),
      stdout: capture.stdout,
      stderr: capture.stderr,
    });
    const data = JSON.parse(capture.out) as Report;
    const finding = data.findings.find((f) => f.rule === "ui-styles-missing");

    if (exitCode !== 1 || finding === undefined) {
      expect.fail("not wired\nValidate does not check mockups\n");
    }
    expect(exitCode).toBe(1);
    expect(finding.message).toContain("ui.styles");
  });
});
