import { readdirSync } from "node:fs";
import path from "node:path";

import { answerPath } from "../answer-path.js";
import { readTextFile } from "../read-text.js";
import { loadSchema } from "../schemas/load-schema.js";
import { parseOutputTarget, type OutputTarget } from "../schemas/output-target.js";
import { readChangeState } from "../status/change-status.js";
import { makeFinding, type Finding } from "../validation/finding.js";
import { scanSpec } from "../validation/scan-spec.js";
import { readChangeConfig } from "../workspace/change-config.js";
import { workspacePaths } from "../workspace/paths.js";
import type { PlanTasks } from "./task-list.js";

/** One requirement of a delta spec: where it lives and what it is called. */
export interface DeltaRequirement {
  /** Capability path as written under `specs/`, such as `identity/user-auth`. */
  capability: string;
  /** Requirement name, word for word as in the `### Requirement:` heading. */
  name: string;
}

/** The delta specs of a change, as the coverage rules read them. */
export interface DeltaSpecs {
  /**
   * True when the change declares its delta specs skipped, or the schema has
   * none at all. A skipped delta has no requirements to cover, and the rules
   * report nothing.
   */
  skipped: boolean;
  requirements: DeltaRequirement[];
}

/**
 * Reads the requirements of the change out of its delta specs. The names come
 * from the same scanner `validate` runs, so the plan and the check read one
 * list of requirements and cannot drift apart.
 */
export function readDeltaSpecs(root: string, change: string): DeltaSpecs {
  const config = readChangeConfig(root, change);
  const schema = loadSchema(config.schema);
  const { state } = readChangeState(root, change);
  const changeDir = workspacePaths(root).changeDir(change);

  for (const definition of schema.artifacts) {
    const target = parseOutputTarget(definition.generates);
    if (target.kind !== "glob") {
      continue;
    }

    const status = state.artifacts.find((artifact) => artifact.id === definition.id)?.status;
    if (status === "skipped") {
      return { skipped: true, requirements: [] };
    }

    return { skipped: false, requirements: readRequirements(changeDir, target) };
  }

  return { skipped: true, requirements: [] };
}

/**
 * Two rules over the same pair of lists. A requirement nobody planned and a
 * link to a requirement nobody wrote are two halves of one mistake: without
 * the second rule a typo in the name leaves the requirement uncovered and
 * looking covered at the same time.
 */
export function checkCoverage(plan: PlanTasks, delta: DeltaSpecs): Finding[] {
  if (delta.skipped) {
    return [];
  }

  const findings: Finding[] = [];
  const planned = new Set<string>();

  const written = new Set(
    delta.requirements.map((requirement) =>
      requirementKey(requirement.capability, requirement.name),
    ),
  );

  for (const task of plan.tasks) {
    for (const link of task.links) {
      const key = requirementKey(link.capability, link.requirement);
      planned.add(key);

      if (written.has(key)) {
        continue;
      }

      findings.push(
        makeFinding(
          plan.file,
          task.line,
          "requirement-link-unknown",
          `This task points at "${link.requirement}" of capability ` +
            `"${link.capability}", and no delta spec of the change holds that ` +
            `requirement. ${knownNames(delta, link.capability)}`,
        ),
      );
    }
  }

  for (const requirement of delta.requirements) {
    if (planned.has(requirementKey(requirement.capability, requirement.name))) {
      continue;
    }

    findings.push(
      makeFinding(
        plan.file,
        1,
        "requirement-not-planned",
        `No task names requirement "${requirement.name}" of capability ` +
          `"${requirement.capability}". Add the task that carries it out and end ` +
          `its line with -> ${requirement.capability}#${requirement.name}`,
      ),
    );
  }

  return findings;
}

/** Names the reader can choose from when a link points at nothing. */
function knownNames(delta: DeltaSpecs, capability: string): string {
  const names = delta.requirements
    .filter((requirement) => requirement.capability === capability)
    .map((requirement) => `"${requirement.name}"`);

  if (names.length > 0) {
    return `Requirements of "${capability}": ${names.join(", ")}.`;
  }

  const capabilities = [...new Set(delta.requirements.map((item) => item.capability))];

  return capabilities.length > 0
    ? `The change has no capability "${capability}". It has: ${capabilities.join(", ")}.`
    : "The change has no delta spec with requirements.";
}

/**
 * What two names are compared by: runs of whitespace collapse into one space,
 * the case stays as it is. A requirement name is a heading, and a heading that
 * differs in case is a difference worth seeing.
 */
export function requirementKey(capability: string, requirement: string): string {
  return `${capability}#${requirement.replace(/\s+/g, " ").trim()}`;
}

/** Every requirement of every delta spec file, in file name order. */
function readRequirements(changeDir: string, target: OutputTarget): DeltaRequirement[] {
  if (target.kind !== "glob") {
    return [];
  }

  const specsDir = path.join(path.resolve(changeDir), target.dir);
  const requirements: DeltaRequirement[] = [];

  for (const file of listSpecFiles(specsDir, `.${target.extension}`)) {
    const relative = answerPath(path.relative(specsDir, file));
    const capability = capabilityOf(relative);
    const scan = scanSpec(relative, readTextFile(file));

    for (const requirement of scan.requirements) {
      requirements.push({ capability, name: requirement.name });
    }
  }

  return requirements;
}

/**
 * The capability a spec file belongs to: its path under `specs/` without the
 * extension, with a trailing `spec` dropped, so `auth/spec.md` is `auth`.
 */
export function capabilityOf(relative: string): string {
  const parts = relative.split("/");
  const last = parts.pop()!.replace(/\.[^.]+$/, "");

  if (last !== "spec") {
    parts.push(last);
  }

  return parts.join("/") || last;
}

/** Every file with the given extension under the directory, in name order. */
export function listSpecFiles(dir: string, extension: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...listSpecFiles(full, extension));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(full);
    }
  }

  return files;
}
