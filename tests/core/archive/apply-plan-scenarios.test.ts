import { describe, expect, it } from "vitest";

import { applyPlan } from "../../../src/core/archive/apply-plan.js";
import { parseDeltaPlan } from "../../../src/core/archive/delta-plan.js";
import { parseMainSpec, renderMainSpec } from "../../../src/core/archive/main-spec.js";
import { block, CAPABILITY, delta, FILE, names, spec } from "./apply-plan-fixtures.js";

describe("applyPlan: сценарии и повторное слияние", () => {
  it("MODIFIED, потерявший сценарий, даёт конфликт с именем пропавшего сценария", () => {
    const before = spec(
      block("Logout", "The system SHALL end the session.", [
        "Session ends",
        "Token is dropped",
        "Other devices stay",
      ]),
    );
    const plan = parseDeltaPlan(
      FILE,
      delta(
        "## MODIFIED Requirements",
        "",
        block("Logout", "The system SHALL end the session.", [
          "Session ends",
          "Token is dropped",
        ]),
      ),
    );

    const result = applyPlan(parseMainSpec(before), plan, CAPABILITY);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({ rule: "modified-drops-scenario" });
    expect(result.conflicts[0]!.message).toContain("Other devices stay");
    expect(renderMainSpec(result.spec!)).toBe(before);
  });

  it("те же имена сценариев с другим текстом конфликта не дают, блок заменяется целиком", () => {
    const before = spec(
      [
        "### Requirement: Logout",
        "",
        "The system SHALL end the session.",
        "",
        "#### Scenario: Session ends",
        "",
        "- **WHEN** the user asks to log out",
        "- **THEN** the session closes",
        "",
      ].join("\n"),
    );
    const plan = parseDeltaPlan(
      FILE,
      delta(
        "## MODIFIED Requirements",
        "",
        [
          "### Requirement: Logout",
          "",
          "The system SHALL end the session and drop the token.",
          "",
          "#### Scenario: Session ends",
          "",
          "- **WHEN** the user asks to log out on any device",
          "- **THEN** the session closes and the token goes away",
          "",
        ].join("\n"),
      ),
    );

    const result = applyPlan(parseMainSpec(before), plan, CAPABILITY);
    const after = renderMainSpec(result.spec!);

    expect(result.conflicts).toEqual([]);
    expect(after).toContain("the token goes away");
    expect(after).not.toContain("- **THEN** the session closes\n");
    expect(result.counts.modified).toBe(1);
  });

  it("два сценария с одним именем в спеке против одного во входящем блоке дают конфликт", () => {
    const before = spec(
      block("Logout", "The system SHALL end the session.", ["Session ends", "Session ends"]),
    );
    const plan = parseDeltaPlan(
      FILE,
      delta(
        "## MODIFIED Requirements",
        "",
        block("Logout", "The system SHALL end the session.", ["Session ends"]),
      ),
    );

    const result = applyPlan(parseMainSpec(before), plan, CAPABILITY);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({ rule: "modified-drops-scenario" });
    expect(result.conflicts[0]!.message).toContain("Session ends");
  });

  it("план из одних ADDED на отсутствующей спеке даёт заголовок, назначение и блоки", () => {
    const plan = parseDeltaPlan(
      FILE,
      delta(
        "## ADDED Requirements",
        "",
        block("Password login", "The system SHALL accept a password."),
        block("Logout", "The system SHALL end the session."),
      ),
    );

    const result = applyPlan(null, plan, CAPABILITY);
    const after = renderMainSpec(result.spec!);

    expect(result.conflicts).toEqual([]);
    expect(after.startsWith(`# ${CAPABILITY}\n`)).toBe(true);
    expect(after).toContain("Keeps the rules for signing a user in and out of the product.");
    expect(names(after)).toEqual(["Password login", "Logout"]);
  });

  it("изменение, удаление и переименование на отсутствующей спеке дают spec-missing", () => {
    const plan = parseDeltaPlan(
      FILE,
      delta(
        "## MODIFIED Requirements",
        "",
        block("Logout", "The system SHALL end the session."),
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

    const result = applyPlan(null, plan, CAPABILITY);

    expect(result.conflicts).toHaveLength(3);
    expect(new Set(result.conflicts.map((conflict) => conflict.rule))).toEqual(
      new Set(["spec-missing"]),
    );
    expect(result.conflicts[0]!.message).toContain(CAPABILITY);
    expect(result.spec).toBeNull();
  });

  it("новая capability без раздела Purpose даёт конфликт с путём файла дельты", () => {
    const plan = parseDeltaPlan(
      FILE,
      [
        "## ADDED Requirements",
        "",
        block("Password login", "The system SHALL accept a password."),
      ].join("\n"),
    );

    const result = applyPlan(null, plan, CAPABILITY);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({ file: FILE, rule: "purpose-missing" });
  });

  it("ADDED с посимвольно совпадающим блоком конфликта не даёт и спеку не меняет", () => {
    const logout = block("Logout", "The system SHALL end the session.");
    const before = spec(block("Password login", "The system SHALL accept a password."), logout);
    const plan = parseDeltaPlan(FILE, delta("## ADDED Requirements", "", logout));

    const result = applyPlan(parseMainSpec(before), plan, CAPABILITY);

    expect(result.conflicts).toEqual([]);
    expect(renderMainSpec(result.spec!)).toBe(before);
    expect(result.counts.added).toBe(0);
  });

  it("повторное изменение и повторное переименование конфликта не дают и файл не меняют", () => {
    const logout = block("Logout", "The system SHALL end the session.");
    const before = spec(block("Session end", "The system SHALL drop the token."), logout);
    const plan = parseDeltaPlan(
      FILE,
      delta(
        "## MODIFIED Requirements",
        "",
        logout,
        "## RENAMED Requirements",
        "",
        "- FROM: `### Requirement: Sign out`",
        "- TO: `### Requirement: Session end`",
        "",
      ),
    );

    const result = applyPlan(parseMainSpec(before), plan, CAPABILITY);

    expect(result.conflicts).toEqual([]);
    expect(renderMainSpec(result.spec!)).toBe(before);
    expect(result.counts).toEqual({ added: 0, modified: 0, removed: 0, renamed: 0 });
  });

  it("повторное удаление конфликта не даёт, когда остальные операции уже применены", () => {
    const logout = block("Logout", "The system SHALL end the session.");
    // Спека уже несёт результат этой дельты: MODIFIED записан, REMOVED убран.
    const before = spec(logout);
    const plan = parseDeltaPlan(
      FILE,
      delta(
        "## MODIFIED Requirements",
        "",
        logout,
        "## REMOVED Requirements",
        "",
        block("Device list", "The system SHALL list the devices."),
        "**Reason**: nobody opened it.",
        "",
        "**Migration**: callers read the session list.",
        "",
      ),
    );

    const result = applyPlan(parseMainSpec(before), plan, CAPABILITY);

    expect(result.conflicts).toEqual([]);
    expect(renderMainSpec(result.spec!)).toBe(before);
    expect(result.counts).toEqual({ added: 0, modified: 0, removed: 0, renamed: 0 });
  });

  it("дельта из одних REMOVED на неизвестном имени остаётся конфликтом", () => {
    const before = spec(block("Logout", "The system SHALL end the session."));
    const plan = parseDeltaPlan(
      FILE,
      delta(
        "## REMOVED Requirements",
        "",
        block("Device list", "The system SHALL list the devices."),
        "**Reason**: nobody opened it.",
        "",
        "**Migration**: callers read the session list.",
        "",
      ),
    );

    const result = applyPlan(parseMainSpec(before), plan, CAPABILITY);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({ rule: "removed-name-missing" });
    expect(renderMainSpec(result.spec!)).toBe(before);
  });

  it("удаление рядом с ненаписанным добавлением остаётся конфликтом", () => {
    const before = spec(block("Logout", "The system SHALL end the session."));
    const plan = parseDeltaPlan(
      FILE,
      delta(
        "## ADDED Requirements",
        "",
        block("Password reset", "The system SHALL send a reset link."),
        "## REMOVED Requirements",
        "",
        block("Device list", "The system SHALL list the devices."),
        "**Reason**: nobody opened it.",
        "",
        "**Migration**: callers read the session list.",
        "",
      ),
    );

    const result = applyPlan(parseMainSpec(before), plan, CAPABILITY);

    expect(result.conflicts.map((conflict) => conflict.rule)).toEqual(["removed-name-missing"]);
  });

  it("тот же заголовок с блоком, отличающимся одной строкой, остаётся конфликтом", () => {
    const before = spec(block("Logout", "The system SHALL end the session."));
    const plan = parseDeltaPlan(
      FILE,
      delta(
        "## ADDED Requirements",
        "",
        block("Logout", "The system SHALL end the session on request."),
      ),
    );

    const result = applyPlan(parseMainSpec(before), plan, CAPABILITY);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({ rule: "added-name-taken" });
    expect(renderMainSpec(result.spec!)).toBe(before);
  });
});
