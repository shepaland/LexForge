import { describe, expect, it } from "vitest";

import { pxSection } from "./helpers.js";

describe("раздел 10: параллельные секции в lexforge-apply — отчёт и возврат в сессию", () => {
  it("C1: отчёт несёт цитату упавшей строки, и запись без неё не считается зелёной", () => {
    const stampSection = pxSection("The checkbox and the stamp");

    // MINOR 3 (round 4): pin the whole clause, not a list of guessed
    // qualifiers - a future qualifier the list did not anticipate must still
    // fail this the same way "which the executor may compress" did.
    expect(stampSection).toMatch(
      /the failing line of the run it watched fail, quoted, the command that confirmed it/,
    );
    expect(stampSection).toMatch(/an entry with no quoted failure is not a green entry/);
    expect(stampSection).toMatch(/send it back, or run that task in this session/);
  });

  it("IMPORTANT 4: отчёт несёт диафф файлов задачи и команду подтверждения — не диапазон коммитов", () => {
    const stampSection = pxSection("The checkbox and the stamp");

    expect(stampSection).toMatch(/the diff of the files that task names/);
    expect(stampSection).toMatch(/command that confirmed it/);
    expect(stampSection).not.toMatch(/commit range/);
  });

  it("старый C3: исполнитель нигде не описан как тот, кто сам ставит галочки в tasks.md", () => {
    const stampSection = pxSection("The checkbox and the stamp");

    expect(stampSection).toMatch(/executor never edits `?tasks\.md`?/);
    expect(stampSection).not.toMatch(/executor ticks/);
    expect(stampSection).not.toMatch(/ticks its own box/);
  });

  it("CRITICAL (round 6): a report never re-licenses an executor's own reviewer - the verdict is the session's to carry", () => {
    const stampSection = pxSection("The checkbox and the stamp");

    expect(stampSection).toMatch(
      /the reviewer's verdict is not the executor's to carry: the session starts the reviewer, and the session reads what it comes back with\./,
    );

    for (const phrase of [
      "where the executor could dispatch its own reviewer",
      "that reviewer's verdict",
    ]) {
      expect(
        stampSection,
        `«${phrase}» — снятая лицензия исполнителю на своего ревьюера ещё жива`,
      ).not.toContain(phrase);
    }
  });

});
