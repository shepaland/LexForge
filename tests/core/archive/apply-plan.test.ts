import { describe, expect, it } from "vitest";

import { applyPlan } from "../../../src/core/archive/apply-plan.js";
import { parseDeltaPlan } from "../../../src/core/archive/delta-plan.js";
import { parseMainSpec, renderMainSpec } from "../../../src/core/archive/main-spec.js";
import { block, CAPABILITY, delta, FILE, names, spec } from "./apply-plan-fixtures.js";

describe("applyPlan", () => {
  it("пустой план отдаёт спеку без изменений и ноль конфликтов", () => {
    const before = spec(block("Password login", "The system SHALL accept a password."));
    const result = applyPlan(parseMainSpec(before), parseDeltaPlan(FILE, delta()), CAPABILITY);

    expect(result.conflicts).toEqual([]);
    expect(renderMainSpec(result.spec!)).toBe(before);
    expect(result.counts).toEqual({ added: 0, modified: 0, removed: 0, renamed: 0 });
  });

  it("требование секции ADDED встаёт последним, прежние блоки держат порядок", () => {
    const before = spec(
      block("Password login", "The system SHALL accept a password."),
      block("Logout", "The system SHALL end the session."),
    );
    const plan = parseDeltaPlan(
      FILE,
      delta(
        "## ADDED Requirements",
        "",
        block("Password reset", "The system SHALL send a reset link."),
      ),
    );

    const result = applyPlan(parseMainSpec(before), plan, CAPABILITY);
    const after = renderMainSpec(result.spec!);

    expect(result.conflicts).toEqual([]);
    expect(names(after)).toEqual(["Password login", "Logout", "Password reset"]);
    expect(after).toContain("The system SHALL send a reset link.");
    expect(result.counts.added).toBe(1);
  });

  it("требование секции MODIFIED заменяется целиком и остаётся на своём месте", () => {
    const before = spec(
      block("Password login", "The system SHALL accept a password."),
      block("Logout", "The system SHALL end the session."),
      block("Password reset", "The system SHALL send a reset link."),
    );
    const plan = parseDeltaPlan(
      FILE,
      delta("## MODIFIED Requirements", "", block("Logout", "The system SHALL drop the token.")),
    );

    const result = applyPlan(parseMainSpec(before), plan, CAPABILITY);
    const after = renderMainSpec(result.spec!);

    expect(result.conflicts).toEqual([]);
    expect(names(after)).toEqual(["Password login", "Logout", "Password reset"]);
    expect(after).toContain("The system SHALL drop the token.");
    expect(after).not.toContain("The system SHALL end the session.");
    expect(result.counts.modified).toBe(1);
  });

  it("требование секции REMOVED исчезает, соседи остаются, лишних пустых строк нет", () => {
    const before = spec(
      block("Password login", "The system SHALL accept a password."),
      block("Logout", "The system SHALL end the session."),
      block("Password reset", "The system SHALL send a reset link."),
    );
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
      ),
    );

    const result = applyPlan(parseMainSpec(before), plan, CAPABILITY);
    const after = renderMainSpec(result.spec!);

    expect(result.conflicts).toEqual([]);
    expect(names(after)).toEqual(["Password login", "Password reset"]);
    expect(after).not.toContain("The system SHALL end the session.");
    expect(after).not.toContain("\n\n\n");
    expect(result.counts.removed).toBe(1);
  });

  it("переименование меняет имя в заголовке, текст блока и его место остаются", () => {
    const before = spec(
      block("Password login", "The system SHALL accept a password."),
      block("Logout", "The system SHALL end the session."),
      block("Password reset", "The system SHALL send a reset link."),
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
    const after = renderMainSpec(result.spec!);

    expect(result.conflicts).toEqual([]);
    expect(names(after)).toEqual(["Password login", "Session end", "Password reset"]);
    expect(after).toContain("The system SHALL end the session.");
    expect(result.counts.renamed).toBe(1);
  });

  it("переименование и следом изменение под новым именем дают один блок с новым текстом", () => {
    const before = spec(block("Logout", "The system SHALL end the session."));
    const plan = parseDeltaPlan(
      FILE,
      delta(
        "## MODIFIED Requirements",
        "",
        block("Session end", "The system SHALL drop the token."),
        "## RENAMED Requirements",
        "",
        "- FROM: `### Requirement: Logout`",
        "- TO: `### Requirement: Session end`",
        "",
      ),
    );

    const result = applyPlan(parseMainSpec(before), plan, CAPABILITY);
    const after = renderMainSpec(result.spec!);

    expect(result.conflicts).toEqual([]);
    expect(names(after)).toEqual(["Session end"]);
    expect(after).toContain("The system SHALL drop the token.");
    expect(after).not.toContain("The system SHALL end the session.");
  });

  it("переименование освобождает имя, и добавленное требование его занимает", () => {
    const before = spec(block("Logout", "The system SHALL end the session."));
    const plan = parseDeltaPlan(
      FILE,
      delta(
        "## ADDED Requirements",
        "",
        block("Logout", "The system SHALL ask the user to confirm."),
        "## RENAMED Requirements",
        "",
        "- FROM: `### Requirement: Logout`",
        "- TO: `### Requirement: Session end`",
        "",
      ),
    );

    const result = applyPlan(parseMainSpec(before), plan, CAPABILITY);
    const after = renderMainSpec(result.spec!);

    expect(result.conflicts).toEqual([]);
    expect(names(after)).toEqual(["Session end", "Logout"]);
    expect(after).toContain("The system SHALL end the session.");
    expect(after).toContain("The system SHALL ask the user to confirm.");
  });
});
