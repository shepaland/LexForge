import { describe, expect, it } from "vitest";

import { applyChange, applyPlan } from "../../../src/core/archive/apply-plan.js";
import { parseDeltaPlan } from "../../../src/core/archive/delta-plan.js";
import { parseMainSpec, renderMainSpec } from "../../../src/core/archive/main-spec.js";
import { block, CAPABILITY, delta, FILE, names, spec } from "./apply-plan-fixtures.js";

describe("applyPlan: предусловия операций", () => {
  it("ADDED с занятым именем даёт конфликт added-name-taken и спеку не меняет", () => {
    const before = spec(block("Logout", "The system SHALL end the session."));
    const plan = parseDeltaPlan(
      FILE,
      delta("## ADDED Requirements", "", block("Logout", "The system SHALL drop the token.")),
    );

    const result = applyPlan(parseMainSpec(before), plan, CAPABILITY);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      file: FILE,
      level: "error",
      rule: "added-name-taken",
    });
    expect(result.conflicts[0]!.message).toContain("Logout");
    expect(result.conflicts[0]!.message).toContain(CAPABILITY);
    expect(renderMainSpec(result.spec!)).toBe(before);
  });

  it("отсутствующее имя даёт свой конфликт для изменения, удаления и старого имени", () => {
    const before = spec(block("Logout", "The system SHALL end the session."));
    const plan = parseDeltaPlan(
      FILE,
      delta(
        "## MODIFIED Requirements",
        "",
        block("Token refresh", "The system SHALL refresh the token."),
        "## REMOVED Requirements",
        "",
        "### Requirement: Device list",
        "",
        "**Reason**: nobody opened it.",
        "",
        "**Migration**: callers read the session list.",
        "",
        "## RENAMED Requirements",
        "",
        "- FROM: `### Requirement: Sign up`",
        "- TO: `### Requirement: Registration`",
        "",
      ),
    );

    const result = applyPlan(parseMainSpec(before), plan, CAPABILITY);

    expect(result.conflicts.map((conflict) => conflict.rule).sort()).toEqual([
      "modified-name-missing",
      "removed-name-missing",
      "renamed-source-missing",
    ]);
    expect(renderMainSpec(result.spec!)).toBe(before);
  });

  it("RENAMED TO с занятым именем даёт конфликт renamed-target-taken", () => {
    const before = spec(
      block("Logout", "The system SHALL end the session."),
      block("Session end", "The system SHALL drop the token."),
    );
    const plan = parseDeltaPlan(
      FILE,
      delta(
        "## RENAMED Requirements",
        "",
        "- FROM: `### Requirement: Logout`",
        "- TO: `### Requirement: Session end`",
        "",
      ),
    );

    const result = applyPlan(parseMainSpec(before), plan, CAPABILITY);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({ rule: "renamed-target-taken" });
    expect(result.conflicts[0]!.message).toContain("Session end");
    expect(renderMainSpec(result.spec!)).toBe(before);
  });

  it("имя в двух секциях даёт operation-conflict, и обе операции не применяются", () => {
    const before = spec(block("Logout", "The system SHALL end the session."));
    const plan = parseDeltaPlan(
      FILE,
      delta(
        "## REMOVED Requirements",
        "",
        "### Requirement: Logout",
        "",
        "**Reason**: the session ends with the token.",
        "",
        "**Migration**: callers drop the token instead.",
        "",
        "## RENAMED Requirements",
        "",
        "- FROM: `### Requirement: Logout`",
        "- TO: `### Requirement: Session end`",
        "",
      ),
    );

    const result = applyPlan(parseMainSpec(before), plan, CAPABILITY);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({ rule: "operation-conflict" });
    expect(result.conflicts[0]!.message).toContain("Logout");
    expect(renderMainSpec(result.spec!)).toBe(before);
    expect(result.counts).toEqual({ added: 0, modified: 0, removed: 0, renamed: 0 });
  });

  it("имя, отличающееся пробелом или регистром, попадает в текст конфликта подсказкой", () => {
    const before = spec(block("Password login", "The system SHALL accept a password."));
    const plan = parseDeltaPlan(
      FILE,
      delta(
        "## MODIFIED Requirements",
        "",
        block("Password  Login", "The system SHALL accept a long password."),
      ),
    );

    const result = applyPlan(parseMainSpec(before), plan, CAPABILITY);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({ rule: "modified-name-missing" });
    expect(result.conflicts[0]!.message).toContain('"Password login"');
  });
});

describe("applyChange", () => {
  it("три конфликта в двух capability отдают три конфликта и ни одной спеки", () => {
    const authSpec = spec(block("Logout", "The system SHALL end the session."));
    const billingSpec = [
      "# billing",
      "",
      "## Purpose",
      "",
      "Charges the customer once a month.",
      "",
      "## Requirements",
      "",
      block("Monthly charge", "The system SHALL charge the card."),
    ].join("\n");

    const result = applyChange([
      {
        capability: CAPABILITY,
        deltaFile: FILE,
        delta: delta(
          "## ADDED Requirements",
          "",
          block("Logout", "The system SHALL drop the token."),
          "## MODIFIED Requirements",
          "",
          block("Token refresh", "The system SHALL refresh the token."),
        ),
        specFile: `lexforge/specs/${CAPABILITY}/spec.md`,
        spec: authSpec,
      },
      {
        capability: "billing",
        deltaFile: "lexforge/changes/add-auth/specs/billing/spec.md",
        delta: [
          "## Purpose",
          "",
          "Charges the customer once a month.",
          "",
          "## REMOVED Requirements",
          "",
          "### Requirement: Yearly charge",
          "",
          "**Reason**: nobody took the yearly plan.",
          "",
          "**Migration**: callers take the monthly plan.",
          "",
        ].join("\n"),
        specFile: "lexforge/specs/billing/spec.md",
        spec: billingSpec,
      },
    ]);

    expect(result.conflicts).toHaveLength(3);
    expect(result.specs).toEqual([]);
    expect(new Set(result.conflicts.map((conflict) => conflict.file))).toEqual(
      new Set([FILE, "lexforge/changes/add-auth/specs/billing/spec.md"]),
    );
  });

  it("без конфликтов отдаёт текст каждой спеки и признак изменения", () => {
    const authSpec = spec(block("Logout", "The system SHALL end the session."));

    const result = applyChange([
      {
        capability: CAPABILITY,
        deltaFile: FILE,
        delta: delta(
          "## ADDED Requirements",
          "",
          block("Password login", "The system SHALL accept a password."),
        ),
        specFile: `lexforge/specs/${CAPABILITY}/spec.md`,
        spec: authSpec,
      },
      {
        capability: "billing",
        deltaFile: "lexforge/changes/add-auth/specs/billing/spec.md",
        delta: [
          "## Purpose",
          "",
          "Charges the customer once a month.",
          "",
          "## ADDED Requirements",
          "",
          block("Monthly charge", "The system SHALL charge the card."),
        ].join("\n"),
        specFile: "lexforge/specs/billing/spec.md",
        spec: null,
      },
    ]);

    expect(result.conflicts).toEqual([]);
    expect(result.specs.map((written) => written.file)).toEqual([
      `lexforge/specs/${CAPABILITY}/spec.md`,
      "lexforge/specs/billing/spec.md",
    ]);
    expect(result.specs.every((written) => written.changed)).toBe(true);
    expect(names(result.specs[0]!.content)).toEqual(["Logout", "Password login"]);
    expect(result.specs[1]!.content.startsWith("# billing\n")).toBe(true);
  });

  it("повторное слияние того же текста отдаёт спеку без признака изменения", () => {
    const logout = block("Logout", "The system SHALL end the session.");
    const authSpec = spec(logout);

    const result = applyChange([
      {
        capability: CAPABILITY,
        deltaFile: FILE,
        delta: delta("## ADDED Requirements", "", logout),
        specFile: `lexforge/specs/${CAPABILITY}/spec.md`,
        spec: authSpec,
      },
    ]);

    expect(result.conflicts).toEqual([]);
    expect(result.specs[0]!.changed).toBe(false);
    expect(result.specs[0]!.content).toBe(authSpec);
  });
});
