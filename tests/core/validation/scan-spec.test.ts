import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { Finding } from "../../../src/core/validation/finding.js";
import { scanSpecFile, type SpecScanResult } from "../../../src/core/validation/scan-spec.js";

const FIXTURES = fileURLToPath(new URL("../../fixtures/specs", import.meta.url));

function scan(name: string): SpecScanResult {
  return scanSpecFile(path.join(FIXTURES, name));
}

function rules(findings: Finding[]): string[] {
  return findings.map((finding) => finding.rule);
}

describe("scanSpecFile на валидной дельта-спеке", () => {
  it("возвращает одно требование с именем, строкой, операцией и сценарием", () => {
    const result = scan("valid.md");

    expect(result.findings).toEqual([]);
    expect(result.requirements).toHaveLength(1);

    const requirement = result.requirements[0]!;
    expect(requirement.name).toBe("Change carries a delta spec");
    expect(requirement.line).toBe(7);
    expect(requirement.operation).toBe("ADDED");
    expect(requirement.scenarios).toHaveLength(1);
    expect(requirement.scenarios[0]).toEqual({
      name: "Delta spec is written",
      line: 11,
      hasWhen: true,
      hasThen: true,
    });
  });

  it("не считает находкой ни одну строку файла", () => {
    expect(rules(scan("valid.md").findings)).toEqual([]);
  });
});

describe("scanSpecFile на требовании без сценариев", () => {
  it("сообщает находку со строкой заголовка и именем требования", () => {
    const result = scan("no-scenario.md");

    expect(result.findings).toHaveLength(1);

    const finding = result.findings[0]!;
    expect(finding.rule).toBe("requirement-without-scenario");
    expect(finding.line).toBe(3);
    expect(finding.level).toBe("error");
    expect(finding.file).toBe(path.join(FIXTURES, "no-scenario.md"));
    expect(finding.message).toContain("Empty requirement");
  });
});

describe("scanSpecFile на требовании без имени", () => {
  it("сообщает находку со строкой заголовка", () => {
    const result = scan("no-name.md");

    expect(rules(result.findings)).toEqual(["requirement-without-name"]);
    expect(result.findings[0]!.line).toBe(3);
  });
});

describe("scanSpecFile на сценарии без половины", () => {
  it("сценарий без результата даёт scenario-without-then с именем и строкой", () => {
    const finding = scan("no-then.md").findings.find(
      (candidate) => candidate.rule === "scenario-without-then",
    );

    expect(finding).toBeDefined();
    expect(finding!.line).toBe(7);
    expect(finding!.message).toContain("Result is missing");
  });

  it("сценарий без условия даёт scenario-without-when", () => {
    const finding = scan("no-then.md").findings.find(
      (candidate) => candidate.rule === "scenario-without-when",
    );

    expect(finding).toBeDefined();
    expect(finding!.line).toBe(11);
    expect(finding!.message).toContain("Condition is missing");
  });

  it("других находок в файле нет", () => {
    expect(rules(scan("no-then.md").findings).sort()).toEqual([
      "scenario-without-then",
      "scenario-without-when",
    ]);
  });
});

describe("scanSpecFile на неверной глубине заголовка сценария", () => {
  it("сценарий из трёх решёток даёт находку с номером строки", () => {
    const findings = scan("depth-three.md").findings;
    const finding = findings.find((candidate) => candidate.line === 7);

    expect(finding).toBeDefined();
    expect(finding!.rule).toBe("scenario-wrong-depth");
    expect(finding!.message).toContain("####");
    expect(finding!.message).toContain("four");
  });

  it("сценарий из пяти решёток даёт ту же находку", () => {
    const finding = scan("depth-three.md").findings.find((candidate) => candidate.line === 12);

    expect(finding).toBeDefined();
    expect(finding!.rule).toBe("scenario-wrong-depth");
  });

  it("требование с такими сценариями пустым не считается", () => {
    expect(rules(scan("depth-three.md").findings)).toEqual([
      "scenario-wrong-depth",
      "scenario-wrong-depth",
    ]);
  });
});

describe("scanSpecFile на требовании вне группы операции", () => {
  it("сообщает находку и перечисляет допустимые заголовки", () => {
    const result = scan("outside-operation.md");

    expect(rules(result.findings)).toEqual(["requirement-outside-operation"]);

    const finding = result.findings[0]!;
    expect(finding.line).toBe(5);
    expect(finding.message).toContain("## ADDED Requirements");
    expect(finding.message).toContain("## MODIFIED Requirements");
    expect(finding.message).toContain("## REMOVED Requirements");
    expect(finding.message).toContain("## RENAMED Requirements");
  });
});

describe("scanSpecFile на удалённом требовании", () => {
  it("требование без строки Reason даёт removed-without-reason с именем", () => {
    const finding = scan("removed-no-reason.md").findings.find(
      (candidate) => candidate.rule === "removed-without-reason",
    );

    expect(finding).toBeDefined();
    expect(finding!.line).toBe(3);
    expect(finding!.message).toContain("Gone without a reason");
  });

  it("требование без строки Migration даёт removed-without-migration с именем", () => {
    const finding = scan("removed-no-reason.md").findings.find(
      (candidate) => candidate.rule === "removed-without-migration",
    );

    expect(finding).toBeDefined();
    expect(finding!.line).toBe(14);
    expect(finding!.message).toContain("Gone without a migration");
  });

  it("других находок в файле нет", () => {
    expect(rules(scan("removed-no-reason.md").findings).sort()).toEqual([
      "removed-without-migration",
      "removed-without-reason",
    ]);
  });
});

describe("scanSpecFile на примере внутри тройных кавычек", () => {
  it("не считает требованием и сценарием строки блока кода", () => {
    const result = scan("fence.md");

    expect(result.requirements).toEqual([]);
    expect(result.findings).toEqual([]);
  });
});
