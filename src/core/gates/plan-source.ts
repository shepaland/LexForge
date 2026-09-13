import path from "node:path";

import { readTextFile, splitTextLines } from "../read-text.js";
import { parseTaskList, type PlanTask } from "./task-list.js";
import {
  collectSectionFiles,
  parseSections,
  readDependsOn,
  type PlanSection,
} from "./plan-check-sections-parse.js";

/** A section heading's next non-blank line, when it is a lone link and nothing else. */
const LONE_LINK = /^`([^`\s]+)`$/;

/** Every task and every section a plan resolves to, its file split honoured. */
export interface PlanSource {
  tasks: PlanTask[];
  sections: PlanSection[];
}

/**
 * Reads a plan's tasks and sections off `artifactFile`, resolving each
 * section either from the artifact's own content or from the file a lone
 * link under its heading points at.
 *
 * A section whose heading is followed directly by its own `Depends on:`
 * line and tasks is read straight off `artifactFile`: `file` and
 * `headingFile` both come back equal to it, matching what `checkPlan` read
 * before this module existed.
 *
 * A section whose heading's next non-blank line is a lone backtick-quoted
 * link, one path segment below `artifactFile`, is read off the file that
 * link names instead: its tasks and its `Depends on:` line get line numbers
 * counted from that file, `file` is set to it, and `headingFile` stays
 * `artifactFile` - the heading itself never moved. `headingLine` always
 * names the line the heading stands on inside `artifactFile`, whichever
 * file the rest of the section came from.
 */
export function readPlanSource(artifactFile: string): PlanSource {
  const content = readTextFile(artifactFile);
  const lines = splitTextLines(content);
  const ownTasks = parseTaskList(content, artifactFile);
  const ownSections = parseSections(content, ownTasks, artifactFile);

  const tasks: PlanTask[] = [];
  const sections: PlanSection[] = [];

  ownSections.forEach((section, index) => {
    const nextHeadingLine = ownSections[index + 1]?.headingLine ?? lines.length + 1;
    const link = findSectionLink(lines, section.headingLine, nextHeadingLine);

    if (!link) {
      tasks.push(...section.tasks);
      sections.push(section);
      return;
    }

    const linkedFile = path.join(path.dirname(artifactFile), link.target);
    const linkedContent = readTextFile(linkedFile);
    const linkedLines = splitTextLines(linkedContent);
    const linkedTasks = parseTaskList(linkedContent, linkedFile);
    const firstTaskLine = linkedTasks[0]?.line ?? linkedLines.length + 1;
    const depends = readDependsOn(linkedLines, 0, firstTaskLine);
    const linkTrailingLine = findTrailingContent(lines, link.line, nextHeadingLine);

    tasks.push(...linkedTasks);
    sections.push({
      number: section.number,
      headingLine: section.headingLine,
      dependsOnLine: depends.dependsOnLine,
      dependsOnRepeated: depends.dependsOnRepeated,
      dependsOnUnreadable: depends.dependsOnUnreadable,
      dependsOn: depends.dependsOn,
      files: collectSectionFiles(linkedTasks),
      tasks: linkedTasks,
      file: linkedFile,
      headingFile: artifactFile,
      linkTrailingLine,
    });
  });

  return { tasks, sections };
}

/**
 * The first non-blank line after `afterLine` and before `beforeLine`, when
 * one exists - a `Depends on:` line or a task left behind a resolved link,
 * read from neither file the section is otherwise built from.
 */
function findTrailingContent(
  lines: string[],
  afterLine: number,
  beforeLine: number,
): number | undefined {
  for (let lineNo = afterLine + 1; lineNo < beforeLine; lineNo += 1) {
    if (lines[lineNo - 1]!.trim() !== "") {
      return lineNo;
    }
  }

  return undefined;
}

/**
 * The first non-blank line after a heading, when it is a lone backtick span
 * and nothing else on the line - a task line or a `Depends on:` line there
 * instead means the section is written inline, not as a link.
 */
function findSectionLink(
  lines: string[],
  headingLine: number,
  nextHeadingLine: number,
): { line: number; target: string } | undefined {
  for (let lineNo = headingLine + 1; lineNo < nextHeadingLine; lineNo += 1) {
    const raw = lines[lineNo - 1]!;
    if (raw.trim() === "") {
      continue;
    }

    const match = LONE_LINK.exec(raw.trim());
    return match ? { line: lineNo, target: match[1]! } : undefined;
  }

  return undefined;
}
