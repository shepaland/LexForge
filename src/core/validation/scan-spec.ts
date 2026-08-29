import { readFileSync } from "node:fs";

import { makeFinding, type Finding } from "./finding.js";

/** Delta operation a requirement is grouped under. */
export type DeltaOperation = "ADDED" | "MODIFIED" | "REMOVED" | "RENAMED";

export interface ScannedScenario {
  name: string;
  line: number;
  hasWhen: boolean;
  hasThen: boolean;
}

export interface ScannedRequirement {
  name: string;
  line: number;
  operation: DeltaOperation | null;
  scenarios: ScannedScenario[];
}

export interface SpecScanResult {
  requirements: ScannedRequirement[];
  findings: Finding[];
}

/** Group headings a requirement is allowed to stand under. */
const OPERATION_HEADINGS = [
  "## ADDED Requirements",
  "## MODIFIED Requirements",
  "## REMOVED Requirements",
  "## RENAMED Requirements",
];

const FENCE = /^\s*```/;
const OPERATION_HEADING = /^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements\s*$/;
const TOP_HEADING = /^##\s+\S/;
const REQUIREMENT_HEADING = /^###\s+Requirement:\s*(.*)$/;
const SCENARIO_HEADING = /^(#+)\s+Scenario:\s*(.*)$/;
/** A scenario heading takes exactly four hashes; anything else is a finding. */
const SCENARIO_DEPTH = 4;
const WHEN_MARKER = /\*\*WHEN\*\*/;
const THEN_MARKER = /\*\*THEN\*\*/;
const REASON_MARKER = /\*\*Reason\*\*/;
const MIGRATION_MARKER = /\*\*Migration\*\*/;

/**
 * Walks a delta spec line by line and keeps three variables: the operation in
 * force, the requirement being read, the scenario being read. A markdown parser
 * is no help here: a scenario written with three hashes is a heading like any
 * other to it, and that is exactly what has to be caught.
 */
export function scanSpec(file: string, content: string): SpecScanResult {
  const requirements: ScannedRequirement[] = [];
  const findings: Finding[] = [];

  let operation: DeltaOperation | null = null;
  let requirement: ScannedRequirement | null = null;
  let scenario: ScannedScenario | null = null;
  let inFence = false;
  let hasReason = false;
  let hasMigration = false;

  const closeScenario = (): void => {
    if (scenario && !scenario.hasWhen) {
      findings.push(
        makeFinding(
          file,
          scenario.line,
          "scenario-without-when",
          `Scenario "${scenario.name}" has no condition. Add a line with **WHEN**.`,
        ),
      );
    }

    if (scenario && !scenario.hasThen) {
      findings.push(
        makeFinding(
          file,
          scenario.line,
          "scenario-without-then",
          `Scenario "${scenario.name}" has no result. Add a line with **THEN**.`,
        ),
      );
    }

    scenario = null;
  };

  const closeRequirement = (): void => {
    closeScenario();

    if (requirement && requirement.scenarios.length === 0) {
      findings.push(
        makeFinding(
          file,
          requirement.line,
          "requirement-without-scenario",
          `Requirement "${requirement.name}" has no scenarios. ` +
            "Add at least one `#### Scenario: <name>` block under it.",
        ),
      );
    }

    if (requirement && requirement.operation === "REMOVED" && !hasReason) {
      findings.push(
        makeFinding(
          file,
          requirement.line,
          "removed-without-reason",
          `Removed requirement "${requirement.name}" has no reason. ` +
            "Add a line starting with **Reason** and say why it goes away.",
        ),
      );
    }

    if (requirement && requirement.operation === "REMOVED" && !hasMigration) {
      findings.push(
        makeFinding(
          file,
          requirement.line,
          "removed-without-migration",
          `Removed requirement "${requirement.name}" has no migration. ` +
            "Add a line starting with **Migration** and say what callers do instead.",
        ),
      );
    }

    requirement = null;
    hasReason = false;
    hasMigration = false;
  };

  const lines = content.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const lineNumber = index + 1;

    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      continue;
    }

    const scenarioHeading = SCENARIO_HEADING.exec(line);
    if (scenarioHeading) {
      closeScenario();

      const depth = scenarioHeading[1]!.length;
      if (depth !== SCENARIO_DEPTH) {
        findings.push(
          makeFinding(
            file,
            lineNumber,
            "scenario-wrong-depth",
            `Scenario heading has ${depth} hashes. A scenario takes four of them: ` +
              "`#### Scenario: <name>`.",
          ),
        );
      }

      scenario = {
        name: scenarioHeading[2]!.trim(),
        line: lineNumber,
        hasWhen: false,
        hasThen: false,
      };
      requirement?.scenarios.push(scenario);
      continue;
    }

    const operationHeading = OPERATION_HEADING.exec(line);
    if (operationHeading) {
      closeRequirement();
      operation = operationHeading[1] as DeltaOperation;
      continue;
    }

    if (TOP_HEADING.test(line)) {
      closeRequirement();
      operation = null;
      continue;
    }

    const requirementHeading = REQUIREMENT_HEADING.exec(line);
    if (requirementHeading) {
      closeRequirement();

      if (operation === null) {
        findings.push(
          makeFinding(
            file,
            lineNumber,
            "requirement-outside-operation",
            "Requirement stands outside an operation group. Put it under one of " +
              `${OPERATION_HEADINGS.join(", ")}.`,
          ),
        );
      }

      const name = requirementHeading[1]!.trim();
      if (name === "") {
        findings.push(
          makeFinding(
            file,
            lineNumber,
            "requirement-without-name",
            "Requirement heading has no name. " +
              "Write the name after the colon: `### Requirement: <name>`.",
          ),
        );
      }

      requirement = { name, line: lineNumber, operation, scenarios: [] };
      requirements.push(requirement);
      continue;
    }

    if (requirement) {
      if (REASON_MARKER.test(line)) {
        hasReason = true;
      }
      if (MIGRATION_MARKER.test(line)) {
        hasMigration = true;
      }
    }

    if (scenario) {
      if (WHEN_MARKER.test(line)) {
        scenario.hasWhen = true;
      }
      if (THEN_MARKER.test(line)) {
        scenario.hasThen = true;
      }
    }
  }

  closeRequirement();

  return { requirements, findings };
}

/** Reads the file and scans it. Findings carry the path they were given. */
export function scanSpecFile(filePath: string): SpecScanResult {
  return scanSpec(filePath, readFileSync(filePath, "utf8"));
}
