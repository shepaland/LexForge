import { describe, expect, it } from "vitest";

import { reviewerPromptText, rpSection } from "./helpers.js";

const MARKER = "\nThe reviewer brief has no engineering rules\n";

describe("the reviewer brief reads the engineering rules from the review package", () => {
  it("the section Engineering rules blocks on a rule sign from the package", () => {
    const section = rpSection("Engineering rules");

    expect(section, MARKER).toMatch(/every rule in the package's `engineering rules` whose sign appears in the diff/);
    expect(section, MARKER).toMatch(/is a finding that names the rule id, the file and the line, and the failure the sign points to/);
    expect(section, MARKER).toMatch(/critical or important, never minor/);
    expect(section, MARKER).toMatch(/the task stays open until a fix closes it/);
  });

  it("the brief points the reviewer at the package task green wrote", () => {
    const text = reviewerPromptText();

    expect(text, MARKER).toContain("lexforge/changes/[CHANGE]/tasks/[ID]/review.md");
    expect(text, MARKER).not.toContain("[ENGINEERING_RULES]");
    expect(text, MARKER).not.toContain("lexforge rules --change");
  });

  it("the answer follows the plain-text report of the package", () => {
    const section = rpSection("Answer");

    expect(section, MARKER).toMatch(/`reviewer:`, `verdict:`, `controls:`, `findings:`/);
    expect(section, MARKER).not.toContain("rule_id");
  });
});
