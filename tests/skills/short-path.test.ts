import { describe, expect, it } from "vitest";

import { bodyOf, section } from "./helpers.js";

describe("6.0.0: the short path and the final review instead of the cycles of 5.x", () => {
  it("names the three limits of the short path and does not lift them for size", () => {
    const text = section(bodyOf("lexforge"), "The short path").replace(/\s+/g, " ");

    expect(text).toMatch(/fits one task, no new capability, no `data:` and no migrations/i);
    expect(text).toMatch(/anything more takes the full path, whatever its size/i);

    for (const phrase of [
      "more than one task fits the short path",
      "a new capability still fits the short path",
      "a small migration still fits",
      "a request to keep it small lifts the limit",
    ]) {
      expect(
        text.toLowerCase(),
        `«${phrase}» перевернуло бы границу короткого пути`,
      ).not.toContain(phrase);
    }
  });

  it("holds spec before code on the short path: validate --strict runs before task start, not after", () => {
    const text = section(bodyOf("lexforge"), "The short path").replace(/\s+/g, " ");
    const at = text.indexOf("lexforge validate <name> --strict");

    expect(at, "короткий путь не называет `lexforge validate <name> --strict`").toBeGreaterThan(-1);

    const around = text.slice(at, at + 120);
    expect(around).toMatch(/before `lexforge task\s*start`/i);

    for (const phrase of [
      "task start before",
      "validate is optional on the short path",
      "the delta spec can wait until after the code",
    ]) {
      expect(text.toLowerCase(), `«${phrase}» перевернуло бы порядок`).not.toContain(phrase);
    }
  });

  it("a change that outgrows the short path escalates; it is not trimmed to fit", () => {
    const text = section(bodyOf("lexforge"), "The short path").replace(/\s+/g, " ");
    const at = text.toLowerCase().indexOf("short-path-not-eligible");

    expect(at, "короткий путь не называет отказ `short-path-not-eligible`").toBeGreaterThan(-1);

    const around = text.slice(at, at + 160);
    expect(around).toMatch(/lexforge plan escalate --change <name>/);
    expect(around.toLowerCase()).toMatch(/never trim the change to fit/);

    for (const phrase of [
      "trim the change to fit the short path",
      "drop the task that no longer fits",
    ]) {
      expect(text.toLowerCase(), `«${phrase}» перевернуло бы ответ на отказ`).not.toContain(phrase);
    }
  });

  it("verify reads task records, commits and the final review, not a count of 5.x cycles", () => {
    const machineHalf = section(bodyOf("lexforge-verify"), "The machine half").replace(/\s+/g, " ");
    const lower = machineHalf.toLowerCase();

    for (const dimension of ["tasksWithoutClosedRecord", "missingCommits", "finalReview"]) {
      expect(machineHalf, `машинная половина не называет \`${dimension}\``).toContain(`\`${dimension}\``);
    }

    expect(lower).toMatch(/\bten measures\b/);
    expect(lower).not.toContain("five measures");
    expect(lower).not.toContain("cycle");
  });
});
