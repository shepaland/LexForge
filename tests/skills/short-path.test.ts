import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** A skill's SKILL.md with a source line wrap collapsed to one space. */
function read(skill: string): string {
  const file = fileURLToPath(new URL(`../../skills/${skill}/SKILL.md`, import.meta.url));
  return readFileSync(file, "utf8").replace(/\s+/g, " ");
}

describe("6.0.0: the short path, the final review and the migration", () => {
  it("names the three limits of the short path", () => {
    expect(read("lexforge")).toMatch(/one task, no new capability, no `Data:` and no migrations/);
  });

  it("spec before code on the short path too", () => {
    expect(read("lexforge")).toMatch(/`lexforge validate <name> --strict` before `lexforge task start`/);
  });

  it("verify asks for the final review", () => {
    expect(read("lexforge-verify")).toContain("lexforge review final");
  });

  it("archive names migrate on an old change", () => {
    expect(read("lexforge-archive")).toContain("lexforge migrate --change <name>");
  });
});
