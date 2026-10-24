import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** A file of the apply skill; a missing one reads as empty, so the assertion names what is absent. */
function read(name: string): string {
  const file = fileURLToPath(new URL(`../../skills/lexforge-apply/${name}`, import.meta.url));
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

/** SKILL.md and parallel.md together, with a source line wrap collapsed to one space. */
function applyText(): string {
  return `${read("SKILL.md")}\n${read("parallel.md")}`.replace(/\s+/g, " ");
}

describe("lexforge-apply under the task commands", () => {
  it.each([
    ["task close ticks the box", /`lexforge task close`[^.]*ticks the checkbox/],
    ["state is written by the CLI only", /Never edit `tasks\/<id>\.json`, `plan-state\.json` or a checkbox by hand/],
    ["rulings go to the journal", /`lexforge journal add --kind ruling`/],
    ["four reasons to stop", /Stop for the owner in four cases only/],
    ["a missing file is a question", /`lexforge plan amend`/],
    ["next step comes from the refusal", /run the command `nextStep` names/],
    ["resume after compaction", /`lexforge resume --change <name>`/],
  ])("lexforge-apply: %s", (_name, rule) => {
    expect(applyText()).toMatch(rule);
  });

  it("no 5.x mechanism is named", () => {
    expect(applyText()).not.toMatch(/cycle start|evidence red|lexforge context|workflow 2|wave/);
  });

  it("the executor answers with five fields", () => {
    expect(read("executor-prompt.md")).toMatch(/Status:[\s\S]*Commits:[\s\S]*Red:[\s\S]*Green:[\s\S]*Questions:/);
  });

  it("the reviewer confirms every control", () => {
    expect(read("reviewer-prompt.md")).toContain("Control: <name> — confirmed");
  });
});
