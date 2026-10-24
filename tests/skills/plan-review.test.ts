import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** A file of the plan skill; a missing one reads as empty, so the assertion names what is absent. */
function read(name: string): string {
  const file = fileURLToPath(new URL(`../../skills/lexforge-plan/${name}`, import.meta.url));
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

/** SKILL.md and the plan reviewer's brief together, with a source line wrap collapsed to one space. */
function planText(): string {
  return `${read("SKILL.md")}\n${read("plan-reviewer-prompt.md")}`.replace(/\s+/g, " ");
}

describe("lexforge-plan: task fields, the plan review and the digest", () => {
  it("names the four angles and the command that registers each", () => {
    for (const angle of ["specs", "code", "dependencies", "gaps"]) expect(planText()).toContain(`--angle ${angle}`);
  });

  it("approval waits for four approved angles", () => {
    expect(planText()).toMatch(/until all four angles approved the current plan/);
  });

  it("the digest leads with the agent's own decisions", () => {
    expect(read("digest.md")).toMatch(/^1\. Decisions I made/m);
  });

  it("a task carries Files, Test and Command", () => {
    expect(planText()).toMatch(/`Files:`, `Test:` and `Command:`/);
  });
});
