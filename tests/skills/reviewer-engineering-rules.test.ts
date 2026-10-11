import { describe, expect, it } from "vitest";

import { pxSection, reviewerPromptText, rpSection } from "./helpers.js";

const MARKER = "\nThe reviewer brief has no engineering rules\n";

describe("the reviewer brief carries the selected engineering rules", () => {
  it("the slot table has a row for [ENGINEERING_RULES] filled from lexforge rules", () => {
    const section = rpSection("What goes in");

    expect(section, MARKER).toMatch(/\| `\[engineering_rules\]` \|[^|]*`lexforge rules`[^|]*files of the cycle/);
  });

  it("the section Engineering rules holds the slot and blocks on a rule sign", () => {
    const section = rpSection("Engineering rules");

    expect(section, MARKER).toContain("[engineering_rules]");
    expect(section, MARKER).toMatch(
      /every rule whose sign appears in the patch is a finding that names the rule id, the file and the line, and the failure the sign points to/,
    );
    expect(section, MARKER).toMatch(/critical or important, never minor/);
    expect(section, MARKER).toMatch(/the wave stays open until a fix closes it/);
  });

  it("Engineering rules comes right after Project rules in the brief", () => {
    const text = reviewerPromptText();
    const project = text.indexOf("## Project rules");
    const engineering = text.indexOf("## Engineering rules");
    const next = text.indexOf("## How you work");

    expect(project, MARKER).toBeGreaterThan(-1);
    expect(engineering, MARKER).toBeGreaterThan(project);
    expect(engineering, MARKER).toBeLessThan(next);
  });

  it("the answer form shows a finding with rule_id", () => {
    const section = rpSection("Answer in this form");

    expect(section, MARKER).toMatch(/`rule_id`/);
    expect(section, MARKER).toMatch(/\{[^{}\n]*"rule_id": "[A-Z]+-\d+"[^{}\n]*\}/i);
    expect(section, MARKER).toMatch(/carries `rule_id` in the json/);
  });

  it("the dispatcher runs lexforge rules once for each cycle of the wave and splits on a refusal", () => {
    const section = pxSection("What a dispatched agent is handed");

    expect(section, MARKER).toMatch(/lexforge rules --change <name>/);
    expect(section, MARKER).toMatch(/--files/);
    expect(section, MARKER).toMatch(/once for each of the wave's cycles/);
    expect(section, MARKER).toMatch(/over that cycle's files/);
    expect(section, MARKER).toMatch(/\[ENGINEERING_RULES\]` per cycle/i);
    expect(section, MARKER).toContain("[engineering_rules]");
    expect(section, MARKER).toMatch(/exit 1 with `rules-too-many` or `files-too-many`/);
    expect(section, MARKER).toMatch(/split in the plan before review/);
  });
});
