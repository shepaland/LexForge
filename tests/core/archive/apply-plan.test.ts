import { describe, expect, it } from "vitest";

import { applyChange, applyPlan } from "../../../src/core/archive/apply-plan.js";
import { parseDeltaPlan } from "../../../src/core/archive/delta-plan.js";
import { parseMainSpec, renderMainSpec } from "../../../src/core/archive/main-spec.js";

const CAPABILITY = "user-auth";
const FILE = "lexforge/changes/add-auth/specs/user-auth/spec.md";

/** A requirement block written the way both a spec and a delta carry it. */
function block(name: string, text: string, scenarios: string[] = ["Happy path"]): string {
  const lines = [`### Requirement: ${name}`, "", text, ""];
  for (const scenario of scenarios) {
    lines.push(
      `#### Scenario: ${scenario}`,
      "",
      `- **WHEN** ${scenario.toLowerCase()} happens`,
      "- **THEN** the system answers",
      "",
    );
  }
  return lines.join("\n");
}

/** A main spec with the given blocks under its Requirements section. */
function spec(...blocks: string[]): string {
  return [
    `# ${CAPABILITY}`,
    "",
    "## Purpose",
    "",
    "Keeps the rules for signing a user in and out of the product.",
    "",
    "## Requirements",
    "",
    ...blocks,
  ].join("\n");
}

/** A delta spec built from the sections it is given. */
function delta(...sections: string[]): string {
  return [
    "## Purpose",
    "",
    "Keeps the rules for signing a user in and out of the product.",
    "",
    ...sections,
  ].join("\n");
}

function names(content: string): string[] {
  return parseMainSpec(content).blocks.map((requirement) => requirement.name);
}

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
