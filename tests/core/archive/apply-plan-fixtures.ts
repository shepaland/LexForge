import { parseMainSpec } from "../../../src/core/archive/main-spec.js";

export const CAPABILITY = "user-auth";
export const FILE = "lexforge/changes/add-auth/specs/user-auth/spec.md";

/** A requirement block written the way both a spec and a delta carry it. */
export function block(name: string, text: string, scenarios: string[] = ["Happy path"]): string {
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
export function spec(...blocks: string[]): string {
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
export function delta(...sections: string[]): string {
  return [
    "## Purpose",
    "",
    "Keeps the rules for signing a user in and out of the product.",
    "",
    ...sections,
  ].join("\n");
}

export function names(content: string): string[] {
  return parseMainSpec(content).blocks.map((requirement) => requirement.name);
}
