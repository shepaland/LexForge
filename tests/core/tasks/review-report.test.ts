import { describe, expect, it } from "vitest";
import { parseReviewReport } from "../../../src/core/tasks/review-report.js";

const SAMPLE = [
  "Reviewer: plan-specs-1",
  "Verdict: approved",
  "Controls: migrations",
  "Findings:",
  '- critical: `src/a.ts:12` Requirement "X" has no task.',
  "- minor: wording of task 2.3",
  "",
].join("\n");

describe("parseReviewReport", () => {
  it("reads reviewer, verdict, controls and findings", () => {
    expect(parseReviewReport(SAMPLE, "r.md")).toEqual({
      reviewer: "plan-specs-1",
      verdict: "approved",
      controls: ["migrations"],
      findings: [
        { id: "F1", level: "critical", message: '`src/a.ts:12` Requirement "X" has no task.' },
        { id: "F2", level: "minor", message: "wording of task 2.3" },
      ],
    });
  });

  it("reads a report with no controls and no findings", () => {
    const text = "Reviewer: a\nVerdict: changes-requested\nControls: none\nFindings: none\n";
    expect(parseReviewReport(text, "r.md")).toEqual({
      reviewer: "a",
      verdict: "changes-requested",
      controls: [],
      findings: [],
    });
  });

  it("refuses a report without a verdict line", () => {
    expect(() => parseReviewReport("Reviewer: a\n", "r.md")).toThrowError(
      expect.objectContaining({
        code: "review-report-unreadable",
        message: expect.stringContaining("Verdict:"),
      }),
    );
  });

  it("refuses a report without a reviewer line", () => {
    expect(() => parseReviewReport("Verdict: approved\n", "r.md")).toThrowError(
      expect.objectContaining({
        code: "review-report-unreadable",
        message: expect.stringContaining("Reviewer:"),
      }),
    );
  });

  it("refuses an unknown verdict, control and finding level", () => {
    for (const text of [
      "Reviewer: a\nVerdict: fine\n",
      "Reviewer: a\nVerdict: approved\nControls: speed\n",
      "Reviewer: a\nVerdict: approved\nFindings:\n- huge: something\n",
    ]) {
      expect(() => parseReviewReport(text, "r.md")).toThrowError(
        expect.objectContaining({ code: "review-report-unreadable" }),
      );
    }
  });
});
