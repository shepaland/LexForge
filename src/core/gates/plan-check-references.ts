import path from "node:path";

import { answerPath } from "../answer-path.js";
import { readTextFile } from "../read-text.js";
import { makeFinding, type Finding } from "../validation/finding.js";
import { workspacePaths } from "../workspace/paths.js";
import { capabilityOf, listSpecFiles, readDeltaSpecs, requirementKey } from "./coverage-rules.js";
import type { PlanTasks } from "./task-list.js";

/** A requirement of a delta spec with the material its body points at. */
export interface MaterialRequirement {
  capability: string;
  name: string;
  /** True when the body holds an `Interaction:` line. */
  interaction?: boolean;
  /** The target of the `Mockup:` line, such as `mockups/login.html` or `#login-screen`. */
  mockup?: string;
}

export interface MaterialDelta {
  skipped: boolean;
  requirements: MaterialRequirement[];
}

const REQUIREMENT_HEADING = /^###\s+Requirement:\s*(.+?)\s*$/;
const INTERACTION_LINE = /^\s*Interaction:/;
const MOCKUP_LINE = /^\s*Mockup:\s*(\S.*?)\s*$/;

/**
 * A task that names a requirement with an `Interaction:` or `Mockup:` line has
 * to name the diagram anchor or the mockup path of that requirement, so the
 * executor of the task is handed the material it builds against.
 */
export function checkMaterialReferences(plan: PlanTasks, delta: MaterialDelta): Finding[] {
  if (delta.skipped) {
    return [];
  }

  const byKey = new Map(
    delta.requirements.map((item) => [requirementKey(item.capability, item.name), item]),
  );
  const findings: Finding[] = [];

  for (const task of plan.tasks) {
    for (const link of task.links) {
      const requirement = byKey.get(requirementKey(link.capability, link.requirement));
      if (!requirement) {
        continue;
      }

      for (const wanted of neededReferences(requirement)) {
        if (task.text.includes(wanted.prefix)) {
          continue;
        }

        findings.push(
          makeFinding(
            task.file,
            task.line,
            "task-material-missing",
            `Task ${task.number || task.firstLine} names "${requirement.name}" of capability ` +
              `"${requirement.capability}", which holds ${wanted.what}, and its text does not ` +
              `name it. Write ${wanted.example} in the task.`,
          ),
        );
      }
    }
  }

  return findings;
}

interface Needed {
  prefix: string;
  what: string;
  example: string;
}

/** Same algorithm as the heading anchors of the mockup check. */
function slug(heading: string): string {
  return heading.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}

/** What a task must contain for the requirement: one entry per kind of material it holds. */
function neededReferences(requirement: MaterialRequirement): Needed[] {
  const base = `specs/${requirement.capability}`;
  const mockup = requirement.mockup;
  const needed: Needed[] = [];

  if (mockup && !mockup.startsWith("#")) {
    const file = `${base}/${mockup.replace(/\\/g, "/")}`;
    needed.push({ prefix: file, what: `a Mockup: line for ${mockup}`, example: file });
  } else if (mockup) {
    const anchor = `${base}/spec.md${mockup}`;
    needed.push({ prefix: anchor, what: `a Mockup: line for ${mockup}`, example: anchor });
  }

  if (requirement.interaction) {
    const anchor = `${base}/spec.md#${slug(`Requirement: ${requirement.name}`)}`;
    needed.push({ prefix: anchor, what: "an Interaction: line", example: anchor });
  }

  return needed;
}

/** Reads the delta specs of the change with the `Interaction:` and `Mockup:` lines of each requirement. */
export function readMaterialDelta(root: string, change: string): MaterialDelta {
  const delta = readDeltaSpecs(root, change);
  if (delta.skipped) {
    return { skipped: true, requirements: [] };
  }

  const specsDir = path.join(path.resolve(workspacePaths(root).changeDir(change)), "specs");
  const requirements: MaterialRequirement[] = [];

  for (const file of listSpecFiles(specsDir, ".md")) {
    const capability = capabilityOf(answerPath(path.relative(specsDir, file)));
    let current: MaterialRequirement | undefined;
    let fenced = false;

    for (const line of readTextFile(file).split(/\r?\n/)) {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
      }

      const heading = fenced ? null : REQUIREMENT_HEADING.exec(line);
      if (heading) {
        current = { capability, name: heading[1]!.replace(/\s+/g, " ") };
        requirements.push(current);
        continue;
      }

      if (!current || fenced) {
        continue;
      }

      if (INTERACTION_LINE.test(line)) {
        current.interaction = true;
      }

      const mockup = MOCKUP_LINE.exec(line);
      if (mockup) {
        current.mockup = mockup[1]!;
      }
    }
  }

  return { skipped: false, requirements };
}
