import { describe, expect, it } from "vitest";

import { pxSection } from "./helpers.js";

/**
 * `pxSection` already collapses whitespace runs to one space and lowercases
 * the result; this constant is written to match that shape exactly, so a
 * plain `.trim()` on the section is enough to compare with `toBe`. The table
 * rows come from `lexforge/changes/file-line-limit/pressure-runs.md`, one
 * row per rationalization recorded under "Rationalizations to answer in the
 * new text" for the scenarios append-to-a-390-line-file and
 * one-import-on-keep, quoted word for word; a bullet that pairs two quotes
 * with "/" keeps that pairing in one row rather than splitting into two.
 */
const EXPECTED_LINE_LIMIT_SECTION =
  "## the line limit the limit is `file_limit.lines` in `lexforge/config.yaml`, 400 lines when the key is absent, checked over the files `file_limit.include` covers. no edit takes a covered file from within the limit to over it. code that would goes into a new file instead, written there from the start - not moved out after the task has already pushed the file past the limit. on `long_files: keep`, a file already over the limit when the change started gains no line. wiring a new file into it is paid for by moving an existing block of at least as many lines out into that new file. where no such block exists, stop and report that the change needs re-planning on `refactor`; do not add the line anyway. before closing a task, run `wc -l` on every covered file it wrote. | excuse | reality | |---|---| | \"an edit outside the file the task names\" | the line limit requires exactly that edit once the alternative crosses 400 lines - the red flag names a different problem, not this one. | | \"a scope decision i have no authority to make unilaterally mid-task\" | the limit already decided it. putting new code in a new file is the task, not a scope call left for the reviewer. | | \"not mine to decide inside this task\" | nothing is left to decide - over the limit, the code goes in a new file, every time. | | \"report the overage to the reviewer in plain terms rather than hiding it or working around it\" | reporting an overage after causing it is not the same as not causing it. the file never crosses the limit in the first place. | | \"unrequested tidy-up\" / \"scope creep dressed as a fix\" | moving a block out to pay for a new line is the rule on `keep`, not tidy-up - it is the task. | | \"588 lines is still over the project's 400-line `file_limit`\" / \"chasing the count is moot\" | already over the limit bars adding a line at all on `keep`, whether or not the count was clean to start with. | | \"the one import line the task itself calls for\" | the task calling for the line does not pay for it. moving an equal or larger block out does, or the task stops for re-planning. |";

describe("раздел «The line limit»: правило предела строк для lexforge-apply", () => {
  it("раздел совпадает с ожидаемым дословно: правило плюс таблица оправданий с живых прогонов давления", () => {
    const section = pxSection("The line limit").trim();

    expect(section).toBe(EXPECTED_LINE_LIMIT_SECTION);
  });

  it("не смягчает правило фразой «one line is not growth»", () => {
    const section = pxSection("The line limit");

    expect(section).not.toContain("one line is not growth");
    expect(section).not.toContain("may gain");
  });

  it("«What a dispatched agent is handed» называет предел строк и путь long_files", () => {
    const section = pxSection("What a dispatched agent is handed");

    expect(section).toContain(
      "the line limit from `file_limit` and the change's `long_files` path",
    );
  });
});
