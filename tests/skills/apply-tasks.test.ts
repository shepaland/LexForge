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
    ["rulings go to the journal", /Any other fork is yours: choose, run `lexforge journal add --kind ruling`/],
    ["four reasons to stop", /Stop for the owner in four cases only/],
    ["a missing file is a question", /asked, never guessed/],
    ["plan amend takes the owner's quote", /After the owner's answer run\s*`lexforge plan amend --change <name> --quote "<owner's words>"`/],
    ["the amendment goes through the amendment angle", /`amendment` angle reviewed with `lexforge plan review --change <name> --angle amendment/],
    ["next step comes from the refusal", /run the command `nextStep` names/],
    ["resume after compaction", /After a compaction run `lexforge resume --change <name>` and take progress,\s*running tasks and the journal from it, never from what you remember of the chat\./],
    ["installing 6.0.0 migrates nothing by itself", /migrates no existing change by itself/],
  ])("lexforge-apply: %s", (_name, rule) => {
    expect(applyText()).toMatch(rule);
  });

  it("no 5.x mechanism is named", () => {
    expect(applyText()).not.toMatch(/cycle start|evidence red|lexforge context|workflow 2|wave/);
  });

  it("a review that asks for changes after the close is answered with a fix task and a second review", () => {
    expect(applyText()).toMatch(
      /the fix is a new task through `plan amend`; once it is\s*closed, send the old task's `review\.md` again, and only an approved `task review` of it\s*clears the finding/,
    );
  });

  it("the executor's brief is its own task, never the plan, the design or a shared brief", () => {
    expect(read("executor-prompt.md")).toMatch(
      /not a summary of it, not the plan, not `design\.md`, not a brief shared\s*between tasks/,
    );
  });

  it("the executor answers with five fields", () => {
    expect(read("executor-prompt.md")).toMatch(
      /Status:[\s\S]*Commits:[\s\S]*Red:[\s\S]*Green:[\s\S]*Questions:/,
    );
  });

  it("the executor starts no agent of any type, an agent that continues its work whatever it is called", () => {
    expect(read("executor-prompt.md")).toMatch(
      /Start no agent of any type: no fork, no helper, no reviewer\. An agent that continues\s*your work is forbidden whatever its type is called\./,
    );
  });

  it("task abandon is the one way out of work an agent produced", () => {
    expect(read("executor-prompt.md")).toMatch(
      /the lawful way out is\s*`lexforge task abandon --change <name> --task <id>` and a new `task start`/,
    );
  });

  it("the reviewer confirms every control", () => {
    expect(read("reviewer-prompt.md")).toContain("Control: <name> — confirmed");
  });
});
