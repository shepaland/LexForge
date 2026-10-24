import { describe, expect, it } from "vitest";

import { bodyOf } from "./helpers.js";

const MARKER = "\nThe apply body does not distinguish installation from migration authorization\n";

describe("lexforge-apply states that installing 6.0.0 does not migrate a change by itself", () => {
  it("names the installation line", () => {
    const body = bodyOf("lexforge-apply").replace(/\s+/g, " ");

    expect(body, MARKER).toMatch(/installing lexforge 6\.0\.0\s*migrates no existing change by itself/i);

    for (const phrase of [
      "installing lexforge 6.0.0 migrates every existing change",
      "installing lexforge 6.0.0 migrates the change automatically",
    ]) {
      expect(body.toLowerCase(), `«${phrase}» перевернуло бы смысл строки`).not.toContain(phrase);
    }
  });

  it("answers change-needs-migration with migrate, the historical and open tasks and missingFields, then plan review and owner approval", () => {
    const body = bodyOf("lexforge-apply").replace(/\s+/g, " ");
    const lower = body.toLowerCase();
    const at = lower.indexOf("change-needs-migration");

    expect(at, MARKER).toBeGreaterThan(-1);

    const around = body.slice(at, at + 400);

    expect(around, MARKER).toMatch(/lexforge migrate --change <name>/);
    expect(around, MARKER).toMatch(/historical\s*and open tasks/);
    expect(around, MARKER).toMatch(/missingfields/i);
    expect(around, MARKER).toMatch(/plan review and\s*owner approval/);

    for (const phrase of [
      "stop active agents",
      "publish a package",
      "update a global installation",
    ]) {
      expect(around.toLowerCase(), `«${phrase}» не входит в ответ change-needs-migration`).not.toContain(
        phrase,
      );
    }
  });
});
