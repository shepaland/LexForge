import { describe, expect, it } from "vitest";

import { parseDeltaPlan } from "../../../src/core/archive/delta-plan.js";

const FILE = "lexforge/changes/add-auth/specs/user-auth/spec.md";

const DELTA = [
  "## Purpose",
  "",
  "Keeps the rules for signing a user in and out of the product.",
  "",
  "## ADDED Requirements",
  "",
  "### Requirement: Password login",
  "",
  "The system SHALL accept an email and a password.",
  "",
  "#### Scenario: Correct password",
  "",
  "- **WHEN** the password matches",
  "- **THEN** the session opens",
  "",
  "## MODIFIED Requirements",
  "",
  "### Requirement: Logout",
  "",
  "The system SHALL end the session on request.",
  "",
  "#### Scenario: Session ends",
  "",
  "- **WHEN** the user asks to log out",
  "- **THEN** the session closes",
  "",
].join("\n");

describe("parseDeltaPlan", () => {
  it("отдаёт блоки секций добавления и изменения с именами и дословным текстом", () => {
    const plan = parseDeltaPlan(FILE, DELTA);

    expect(plan.added.map((block) => block.name)).toEqual(["Password login"]);
    expect(plan.modified.map((block) => block.name)).toEqual(["Logout"]);
    expect(plan.added[0]!.line).toBe(7);
    expect(plan.added[0]!.raw).toBe(
      [
        "### Requirement: Password login",
        "",
        "The system SHALL accept an email and a password.",
        "",
        "#### Scenario: Correct password",
        "",
        "- **WHEN** the password matches",
        "- **THEN** the session opens",
        "",
        "",
      ].join("\n"),
    );
    expect(plan.modified[0]!.raw).toBe(
      [
        "### Requirement: Logout",
        "",
        "The system SHALL end the session on request.",
        "",
        "#### Scenario: Session ends",
        "",
        "- **WHEN** the user asks to log out",
        "- **THEN** the session closes",
        "",
      ].join("\n"),
    );
    expect(plan.removed).toEqual([]);
    expect(plan.renamed).toEqual([]);
  });

  it("отдаёт текст раздела назначения, а дельта без него отдаёт пустую строку", () => {
    expect(parseDeltaPlan(FILE, DELTA).purpose).toBe(
      "Keeps the rules for signing a user in and out of the product.",
    );
    expect(parseDeltaPlan(FILE, "## ADDED Requirements\n").purpose).toBe("");
  });

  it("секция удаления отдаёт имена требований, строки Reason и Migration в имя не идут", () => {
    const content = [
      "## REMOVED Requirements",
      "",
      "### Requirement: Password login",
      "",
      "**Reason**: the product moved to one-time codes.",
      "",
      "**Migration**: callers ask for a code and check it.",
      "",
      "### Requirement: Password reset",
      "",
      "**Reason**: nothing to reset any more.",
      "",
      "**Migration**: callers ask for a new code.",
      "",
    ].join("\n");

    const plan = parseDeltaPlan(FILE, content);

    expect(plan.removed).toEqual([
      { name: "Password login", line: 3 },
      { name: "Password reset", line: 9 },
    ]);
    expect(plan.added).toEqual([]);
    expect(plan.modified).toEqual([]);
  });

  it("пара FROM и TO даёт одно переименование со старым и новым именем", () => {
    const content = [
      "## RENAMED Requirements",
      "",
      "- FROM: `### Requirement: Password login`",
      "- TO: `### Requirement: Email and password login`",
      "",
    ].join("\n");

    const plan = parseDeltaPlan(FILE, content);

    expect(plan.renamed).toEqual([
      { from: "Password login", to: "Email and password login", line: 3 },
    ]);
    expect(plan.findings).toEqual([]);
  });
});

/** Shorthand: the rename section with the given lines under its heading. */
function renameSection(...lines: string[]): string {
  return ["## RENAMED Requirements", "", ...lines, ""].join("\n");
}

describe("parseDeltaPlan: дефекты пары переименования", () => {
  it("FROM без TO даёт находку с номером строки", () => {
    const plan = parseDeltaPlan(FILE, renameSection("- FROM: `### Requirement: Logout`"));

    expect(plan.renamed).toEqual([]);
    expect(plan.findings).toHaveLength(1);
    expect(plan.findings[0]).toMatchObject({
      file: FILE,
      line: 3,
      level: "error",
      rule: "renamed-pair-broken",
    });
  });

  it("пустое имя даёт находку с номером строки", () => {
    const plan = parseDeltaPlan(
      FILE,
      renameSection("- FROM: `### Requirement:`", "- TO: `### Requirement: Logout`"),
    );

    expect(plan.findings).toHaveLength(1);
    expect(plan.findings[0]).toMatchObject({ line: 3, rule: "renamed-name-empty" });
  });

  it("две пары с одинаковым FROM дают находку", () => {
    const plan = parseDeltaPlan(
      FILE,
      renameSection(
        "- FROM: `### Requirement: Logout`",
        "- TO: `### Requirement: Session end`",
        "- FROM: `### Requirement: Logout`",
        "- TO: `### Requirement: Session close`",
      ),
    );

    expect(plan.findings).toHaveLength(1);
    expect(plan.findings[0]).toMatchObject({ line: 5, rule: "renamed-duplicate-source" });
    expect(plan.findings[0]!.message).toContain("Logout");
  });

  it("две пары с одинаковым TO дают находку", () => {
    const plan = parseDeltaPlan(
      FILE,
      renameSection(
        "- FROM: `### Requirement: Logout`",
        "- TO: `### Requirement: Session end`",
        "- FROM: `### Requirement: Sign out`",
        "- TO: `### Requirement: Session end`",
      ),
    );

    expect(plan.findings).toHaveLength(1);
    expect(plan.findings[0]).toMatchObject({ line: 5, rule: "renamed-duplicate-target" });
    expect(plan.findings[0]!.message).toContain("Session end");
  });

  it("блок требования внутри секции переименования даёт находку", () => {
    const plan = parseDeltaPlan(
      FILE,
      renameSection(
        "- FROM: `### Requirement: Logout`",
        "- TO: `### Requirement: Session end`",
        "",
        "### Requirement: Session end",
        "",
        "The system SHALL end the session on request.",
      ),
    );

    expect(plan.findings).toHaveLength(1);
    expect(plan.findings[0]).toMatchObject({ line: 6, rule: "renamed-requirement-block" });
  });
});
