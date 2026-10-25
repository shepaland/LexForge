import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { section } from "./helpers.js";

function taskSizingBody(): string {
  const path = fileURLToPath(new URL("../../skills/lexforge-plan/task-sizing.md", import.meta.url));
  return readFileSync(path, "utf8");
}

/** The `## Move declaration` section, whitespace runs collapsed to one space. */
function moveDeclarationSection(): string {
  return section(taskSizingBody(), "Move declaration").replace(/\s+/g, " ").trim();
}

const EXPECTED_MOVE_DECLARATION_SECTION =
  "## Move declaration " +
  "A task whose whole work is carrying existing code from one file to another, without " +
  "changing behaviour, carries `(move)` right after its number: `- [ ] 3.2 (move) ...`. That " +
  "is the one place the CLI reads the declaration - nowhere else on the line counts. " +
  "Such a task carries no `Test:` line, because a move has no run to watch fail: a failing " +
  "test written for it would test behaviour nobody is changing. It keeps `Files:` and the " +
  "`Command:` that `lexforge task green` runs after the move, and `lexforge task red` refuses " +
  "it with `move-task-needs-no-red`. A move is written as one task, whole. " +
  "A task adding a branch, a field or a rule, however small, changes behaviour, so it never " +
  "carries `(move)` and keeps its test and its red run. A move left undeclared has a test " +
  "that cannot fail, and `lexforge task red` refuses the passing run as `red-run-passed`. A " +
  "task declared a move that does change behaviour skips the red run, and only the reviewer " +
  "reading its diff can catch it, since the CLI trusts the declaration. Neither risk is " +
  "closed by guessing: `(move)` is not written just in case, or because the work merely " +
  "resembles a move.";

describe("раздел «Move declaration» держит смысл целиком", () => {
  it("текст раздела совпадает с ожидаемым дословно", () => {
    expect(moveDeclarationSection()).toBe(EXPECTED_MOVE_DECLARATION_SECTION);
  });

  it("(move) идёт сразу за номером, и другое место на строке не считается", () => {
    const text = moveDeclarationSection();

    for (const phrase of ["or elsewhere on the line if that reads better"]) {
      expect(text, `«${phrase}» разрешает ставить (move) не после номера`).not.toContain(phrase);
    }
  });

  it("у переноса нет прогона, который можно увидеть падающим, поэтому у него нет Test:", () => {
    const text = moveDeclarationSection();

    for (const phrase of [
      "because a move has no run to watch fail, though writing a test anyway is harmless",
    ]) {
      expect(text, `«${phrase}» допускает тест для переноса`).not.toContain(phrase);
    }
  });

  it("незаявленный перенос отказывает на task red, и ложный (move) ловит только ревьюер", () => {
    const text = moveDeclarationSection();

    for (const phrase of [
      "refuses the passing run as `red-run-passed`, though it may pass if the diff looks like a move",
    ]) {
      expect(text, `«${phrase}» пропускает незаявленный перенос через task red`).not.toContain(
        phrase,
      );
    }
  });
});
