import { afterEach, describe, expect, it } from "vitest";

import { checkPlan } from "../../../src/core/gates/plan-check.js";
import { verifyChange } from "../../../src/core/gates/verify-change.js";
import { writeAt } from "../../helpers/git-workspace.js";
import { CHANGE, created, workspace } from "./verify-change-fixtures.js";

const TASKS = "- [ ] 1.1 Write `src/big.ts`\n";

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

function lines(count: number): string {
  return Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n") + "\n";
}

describe("a project with no line limit", () => {
  it("check plan names a 900-line file in a task without a finding", () => {
    const w = workspace(TASKS, { "src/big.ts": lines(900) });

    const result = checkPlan({ cwd: w.root, change: CHANGE });

    expect(result.data.findings.map((finding) => finding.rule)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^long-file/)]),
    );
  });

  it("verify reports no line-limit summary field and no line-limit finding", () => {
    const w = workspace(TASKS, { "src/big.ts": lines(380) });
    writeAt(w.root, "src/big.ts", lines(900));

    const { data } = verifyChange({ cwd: w.root, change: CHANGE });

    expect(data.summary).not.toHaveProperty("filesOverLimit");
    expect(data.findings.map((finding) => finding.rule)).not.toContain("file-over-line-limit");
  });
});
