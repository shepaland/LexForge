import { describe, expect, it } from "vitest";

import { reviewerPromptText, rpSection } from "./helpers.js";

const MARKER = "\nThe reviewer brief has no engineering rules\n";

describe("the reviewer brief carries the selected engineering rules", () => {
  it("the slot table has a row for [ENGINEERING_RULES] filled from the task's brief", () => {
    const section = rpSection("What goes in");

    expect(section, MARKER).toMatch(
      /\| `\[engineering_rules\]` \|[^|]*`## engineering rules`[^|]*`lexforge task start`[^|]*brief\.md[^|]*task's files/,
    );
  });

  it("the section Engineering rules holds the slot and blocks on a rule sign", () => {
    const section = rpSection("Engineering rules");

    expect(section, MARKER).toContain("[engineering_rules]");
    expect(section, MARKER).toMatch(
      /every listed rule whose sign appears in the diff is a finding that names the rule id, the file and the line, and the failure the sign points to/,
    );
    expect(section, MARKER).toMatch(/critical or important[^.]*never a warning, never minor/);
    expect(section, MARKER).toMatch(/`task close` refuses with `findings-open` until a fix\s*closes it/);
  });

  it("a rule not in the package is not the reviewer's to raise", () => {
    const section = rpSection("Engineering rules");

    expect(section, MARKER).toMatch(/a rule not listed here is not yours to raise/);
  });

  it("the brief points the reviewer at the package task green wrote", () => {
    const text = reviewerPromptText();

    expect(text, MARKER).toContain("lexforge/changes/[CHANGE]/tasks/[ID]/review.md");
    expect(text, MARKER).not.toContain("lexforge rules --change");
  });

  it("the answer follows the plain-text report of the package", () => {
    const section = rpSection("Answer");

    expect(section, MARKER).toMatch(/`reviewer:`, `verdict:`, `controls:`, `findings:`/);
    expect(section, MARKER).not.toContain("rule_id");
  });
});
