import { describe, expect, it } from "vitest";

import { bodyOf, pxSection, rpSection } from "./helpers.js";

function reviewSection(): string {
  const body = bodyOf("lexforge-apply").replace(/\s+/g, " ");
  const start = body.indexOf("## Review before the checkbox");
  expect(start, "section «Review before the checkbox» not found").toBeGreaterThan(-1);
  const next = body.indexOf("## ", start + 3);
  return (next === -1 ? body.slice(start) : body.slice(start, next)).toLowerCase();
}

describe("apply skill: one review per wave, lean briefs, model of the stage, no polling", () => {
  it("the review section reviews once per wave and no longer reviews every task", () => {
    const text = reviewSection();

    if (text.includes("after every task")) {
      // The cycle's red check matches a whole output line, and vitest prefixes
      // the failure message; print the text on a line of its own as well.
      const message = "The apply skill still reviews every task";
      console.log(message);
      expect.fail(message);
    }
    expect(text).toMatch(/one reviewer per wave/);
    expect(text).toMatch(/every cycle of the section has current green/);
    expect(text).toMatch(/a cycle with controls/);
    expect(text).toMatch(/a reviewer of its own/);
    expect(text).toMatch(/lexforge cycle review --wave/);
  });

  it("the executor's brief is the context output and its run instruction, never the plan", () => {
    const text = pxSection("The executor's brief");

    expect(text).toMatch(/output of `lexforge context`/);
    expect(text).toMatch(/instruction to run it/);
    expect(text).toMatch(/never the full plan/);
    expect(text).toMatch(/the full design/);
    expect(text).toMatch(/a shared brief file/);
    expect(text).toMatch(/\| excuse \| reality \|/);
    expect(text).toContain("полную картину");
  });

  it("each subagent starts on the model of its stage, never the session's model by default", () => {
    const text = pxSection("The model of each subagent");

    expect(text).toMatch(/executors start on the model of `apply`/);
    expect(text).toMatch(/reviewers on the model of `verify`/);
    expect(text).toMatch(/`lexforge status --json`/);
    expect(text).toMatch(/never the session's model by default/);
    expect(text).toMatch(/\| excuse \| reality \|/);
  });

  it("waiting on a subagent is one blocking wait per result, never a loop with a short timeout", () => {
    const text = pxSection("Waiting on a subagent");

    expect(text).toMatch(/one blocking wait per expected result/);
    expect(text).toMatch(/no wait in a loop with a short timeout/);
    expect(text).toMatch(/\| excuse \| reality \|/);
    expect(text).toContain("a short timeout turns it into a heartbeat i can report every half minute");
  });

  it("the next section waits until the wave review is closed", () => {
    const text = pxSection("A wave is every section ready at once");

    expect(text).toMatch(/next section waits until the wave review is closed/);
  });

  it("the re-review gets the fix patch and the earlier findings, and every finding names its cycle", () => {
    const text = rpSection("A re-review");

    expect(text).toMatch(/fix patch and the earlier findings only/);
    expect(text).toContain('"scope": "fixes"');
    expect(text).toMatch(/\| excuse \| reality \|/);
    expect(rpSection("Answer in this form")).toMatch(/every finding names its cycle/);
  });
});
