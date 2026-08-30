import { describe, expect, it } from "vitest";

import {
  blockScenarios,
  parseMainSpec,
  renderMainSpec,
} from "../../../src/core/archive/main-spec.js";

const SPEC = [
  "# user-auth",
  "",
  "## Purpose",
  "",
  "Keeps the rules for signing a user in and out of the product.",
  "",
  "## Requirements",
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

describe("parseMainSpec", () => {
  it("отдаёт заголовок, назначение и два блока требований с дословным текстом", () => {
    const spec = parseMainSpec(SPEC);

    expect(spec.title).toBe("user-auth");
    expect(spec.purpose).toBe("Keeps the rules for signing a user in and out of the product.");
    expect(spec.blocks.map((block) => block.name)).toEqual(["Password login", "Logout"]);
    expect(spec.blocks.map((block) => block.line)).toEqual([9, 18]);
    expect(spec.blocks[0]!.raw).toBe(
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
    expect(spec.blocks[1]!.raw).toBe(
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
  });

  it("блок кончается на следующем заголовке ### или ##, строки внутри остаются дословно", () => {
    const content = [
      "# billing",
      "",
      "## Purpose",
      "",
      "Charges the customer once a month.",
      "",
      "## Requirements",
      "",
      "### Requirement: Monthly charge",
      "",
      "The system SHALL charge the card on the first day of the month.",
      "",
      "#### Scenario: Card is charged",
      "",
      "- **WHEN** the first day comes",
      "- **THEN** the card is charged",
      "",
      "",
      "## Notes",
      "",
      "Written by the billing team.",
      "",
    ].join("\n");

    const spec = parseMainSpec(content);

    expect(spec.blocks).toHaveLength(1);
    expect(spec.blocks[0]!.raw).toBe(
      [
        "### Requirement: Monthly charge",
        "",
        "The system SHALL charge the card on the first day of the month.",
        "",
        "#### Scenario: Card is charged",
        "",
        "- **WHEN** the first day comes",
        "- **THEN** the card is charged",
        "",
        "",
        "",
      ].join("\n"),
    );
  });

  it("заголовок требования внутри ограждённого блока границей блока не считается", () => {
    const content = [
      "# delta-merge",
      "",
      "## Purpose",
      "",
      "Merges the delta of a change into the long-lived spec.",
      "",
      "## Requirements",
      "",
      "### Requirement: Rename pair",
      "",
      "The section SHALL carry a block of this form:",
      "",
      "```",
      "### Requirement: Example name",
      "",
      "The example SHALL stay inside the fence.",
      "```",
      "",
      "#### Scenario: Pair without its second half",
      "",
      "- **WHEN** a FROM line stands alone",
      "- **THEN** the strict check reports a finding",
      "",
    ].join("\n");

    const spec = parseMainSpec(content);

    expect(spec.blocks.map((block) => block.name)).toEqual(["Rename pair"]);
    expect(spec.blocks[0]!.raw).toContain("### Requirement: Example name");
    expect(spec.blocks[0]!.raw).toContain("#### Scenario: Pair without its second half");
  });

  it("файл без раздела требований отдаёт ноль блоков, заголовок и назначение на месте", () => {
    const content = ["# search", "", "## Purpose", "", "Finds a product by its name.", ""].join(
      "\n",
    );

    const spec = parseMainSpec(content);

    expect(spec.title).toBe("search");
    expect(spec.purpose).toBe("Finds a product by its name.");
    expect(spec.blocks).toEqual([]);
  });
});

describe("blockScenarios", () => {
  it("отдаёт имена сценариев по порядку и пропускает сценарий внутри ограждённого блока", () => {
    const content = [
      "# checkout",
      "",
      "## Purpose",
      "",
      "Takes the money and opens the order.",
      "",
      "## Requirements",
      "",
      "### Requirement: Payment",
      "",
      "The system SHALL charge the card before the order opens.",
      "",
      "#### Scenario: Card accepted",
      "",
      "- **WHEN** the bank says yes",
      "- **THEN** the order opens",
      "",
      "A scenario of a spec written by hand looks like this:",
      "",
      "```",
      "#### Scenario: Example inside a fence",
      "```",
      "",
      "#### Scenario: Card declined",
      "",
      "- **WHEN** the bank says no",
      "- **THEN** the order stays closed",
      "",
    ].join("\n");

    const spec = parseMainSpec(content);

    expect(blockScenarios(spec.blocks[0]!)).toEqual(["Card accepted", "Card declined"]);
  });
});

describe("renderMainSpec", () => {
  it("сборка из результата разбора даёт исходный текст посимвольно", () => {
    expect(renderMainSpec(parseMainSpec(SPEC))).toBe(SPEC);
  });
});
