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
  "changing behaviour, carries `(move)` right after its group label: `- [ ] 3.2 [B] (move) " +
  "...`. The label groups tasks into one agent's run, and `(move)` follows it because that " +
  "is the one place a reader checks for the declaration - nowhere else on the line counts. " +
  "Such a task is not written as the usual triple - a test, a red run, an implementation - " +
  "because a move has no run to watch fail: the failing test a triple opens with would test " +
  "behaviour nobody is changing. A move is written as one task, whole. " +
  "A task adding a branch, a field or a rule, however small, changes behaviour, so it never " +
  "carries `(move)` and keeps the triple that comes with a red run. A move left undeclared " +
  "stops the change at `verify`, because the check reads the declaration alone to decide " +
  "whether a red record is owed - and a task declared a move that does change behaviour " +
  "passes that same check when it should have failed, since the check trusts the declaration " +
  "and never rereads the diff. Neither risk is closed by guessing: `(move)` is not written " +
  "just in case, or because the work merely resembles a move.";

describe("раздел «Move declaration» держит смысл целиком", () => {
  it("текст раздела совпадает с ожидаемым дословно", () => {
    expect(moveDeclarationSection()).toBe(EXPECTED_MOVE_DECLARATION_SECTION);
  });

  it("(move) идёт сразу за группой, и другое место на строке не считается", () => {
    const text = moveDeclarationSection();

    for (const phrase of ["or elsewhere on the line if that reads better"]) {
      expect(text, `«${phrase}» разрешает ставить (move) не после ярлыка`).not.toContain(phrase);
    }
  });

  it("у переноса нет прогона, который можно увидеть падающим, поэтому он - одна задача", () => {
    const text = moveDeclarationSection();

    for (const phrase of [
      "because a move has no run to watch fail, though writing the triple anyway is harmless",
    ]) {
      expect(text, `«${phrase}» допускает тройку для переноса`).not.toContain(phrase);
    }
  });

  it("незаявленный перенос останавливает change на verify, и ложный (move) проходит проверку зря", () => {
    const text = moveDeclarationSection();

    for (const phrase of [
      "stops the change at `verify`, though `verify` may let it through if the diff looks like a move",
    ]) {
      expect(text, `«${phrase}» пропускает незаявленный перенос через verify`).not.toContain(
        phrase,
      );
    }
  });
});
