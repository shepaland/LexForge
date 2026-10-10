import { describe, expect, it } from "vitest";

import { bodyOf, section } from "./helpers.js";

function finishing(): string {
  return section(bodyOf("lexforge-archive"), "Finishing the branch")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

describe("lexforge-archive: Finishing the branch follows the dev flow", () => {
  it("no longer offers three integration options", () => {
    const text = finishing();
    if (/three options|open a pull request|leave the branch as it is/.test(text)) {
      const message = "The archive skill still offers three options";
      console.log(message);
      expect.fail(message);
    }
  });

  it("says the archive merges the feature branch into dev itself", () => {
    const text = finishing();
    expect(text).toMatch(/`lexforge archive` merges the change's feature branch into dev itself/);
  });

  it("says a conflict leaves the change on its feature branch with the paths listed", () => {
    const text = finishing();
    expect(text).toMatch(/on a conflict the change stays on its feature branch/);
    expect(text).toMatch(/lists the conflicting paths/);
    expect(text).toMatch(/check out dev, run `git merge feature\/<name>`, resolve, commit/);
  });

  it("merges dev into main only on the user's answer to the nextStep question", () => {
    const text = finishing();
    expect(text).toMatch(/merge dev into main only on the user's answer/);
    expect(text).toMatch(/the question `nextstep` names/);
  });

  it("ends with an excuse and reality table quoting the recorded rationalizations", () => {
    const body = section(bodyOf("lexforge-archive"), "Finishing the branch");
    expect(body).toMatch(/\| Excuse \| Reality \|/);
    for (const quote of [
      "We ship fast here",
      "Archive is done, nice. Thanks.",
      "A pull request I open myself",
    ]) {
      expect(body, quote).toContain(`"${quote}`);
    }
    expect(body.trimEnd().split("\n").pop()).toMatch(/^\|.*\|$/);
  });
});
