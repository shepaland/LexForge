import { splitTextLines } from "../read-text.js";
import type { PlanTask } from "./task-list.js";

/** A section heading: `## <number>. <name>`. */
export const SECTION_HEADING = /^##\s+(\d+)\.\s*(.*)$/;

/** The `Depends on:` line under a heading, before the section's first task. */
const DEPENDS_ON_LINE = /^Depends on:\s*(.+)$/i;

/** One numbered section of the plan, as the dependency rules read it. */
export interface PlanSection {
  /** Section number, such as `4`. */
  number: string;
  /** Line of the `## N. Title` heading, counted from 1. */
  headingLine: number;
  /**
   * Line of the section's first `Depends on:` line, or `undefined` when it
   * has none at all.
   */
  dependsOnLine: number | undefined;
  /** True when the section carries more than one `Depends on:` line. */
  dependsOnRepeated: boolean;
  /**
   * True when every `Depends on:` line the section carries is neither
   * `none` nor names a single section — a placeholder such as `TBD` left in
   * the line's place.
   */
  dependsOnUnreadable: boolean;
  /**
   * Section numbers this section names, read across every `Depends on:`
   * line it carries and merged into one set. Empty for `none`, empty when
   * every line is unreadable, and empty when the section has no line at
   * all — a section in either of the last two states gets its own finding
   * and is not otherwise assumed to depend on anything.
   */
  dependsOn: string[];
  /** Files named by this section's own tasks, in the order first seen. */
  files: string[];
  /** This section's own tasks, in file order - what the group-label rules read. */
  tasks: PlanTask[];
  /**
   * File the section's own tasks and `Depends on:` line live in: the plan's
   * own artifact file for a plan written whole, or the file a lone link
   * under the heading points at for a plan written as an index. Equal to
   * `headingFile` in the first case, different from it in the second.
   */
  file: string;
  /**
   * File the `## N. Title` heading itself stands in - always the plan's own
   * artifact file, whether or not the section's tasks live there too. A
   * finding on the heading, or on a missing/unreadable/cyclic dependency,
   * names this file; a finding on a task or on a readable `Depends on:`
   * line names `file` above instead.
   */
  headingFile: string;
  /**
   * Line, inside `headingFile`, of the first non-blank content found after a
   * resolved link and before the next heading - a `Depends on:` line or a
   * task left behind the link, read from neither file since the link
   * already resolved the section from elsewhere. `undefined` when the
   * section has no link at all (`file` equals `headingFile` already says
   * so) or when a link leaves nothing behind it.
   */
  linkTrailingLine?: number;
}

/**
 * `Depends on:` lines between a heading and a section's first task (or the
 * next heading, when the section has none), merged into one reading: which
 * line to point a finding at, whether it was written more than once, whether
 * it could be read at all, and the section numbers it names. `parseSections`
 * scans a range that starts right after the heading it found in the plan's
 * own content; `readPlanSource` scans a linked file from its very first
 * line, passing `0` in place of a heading line above it.
 */
export function readDependsOn(
  lines: string[],
  headingLine: number,
  firstTaskLine: number,
): {
  dependsOnLine: number | undefined;
  dependsOnRepeated: boolean;
  dependsOnUnreadable: boolean;
  dependsOn: string[];
} {
  const matches: { line: number; raw: string }[] = [];
  for (let lineNo = headingLine + 1; lineNo < firstTaskLine; lineNo += 1) {
    const match = DEPENDS_ON_LINE.exec(lines[lineNo - 1]!.trim());
    if (match) {
      matches.push({ line: lineNo, raw: match[1]!.trim() });
    }
  }

  let dependsOnLine: number | undefined;
  let dependsOnUnreadable = false;
  const dependsOn: string[] = [];

  if (matches.length > 0) {
    dependsOnLine = matches[0]!.line;
    let anyReadable = false;

    for (const { raw } of matches) {
      if (raw.toLowerCase() === "none") {
        anyReadable = true;
        continue;
      }

      const found = [...raw.matchAll(/\d+/g)].map((match) => match[0]!);
      if (found.length > 0) {
        anyReadable = true;
        for (const number of found) {
          if (!dependsOn.includes(number)) {
            dependsOn.push(number);
          }
        }
      }
    }

    dependsOnUnreadable = !anyReadable;
  }

  return {
    dependsOnLine,
    dependsOnRepeated: matches.length > 1,
    dependsOnUnreadable,
    dependsOn,
  };
}

/** Files a section's own tasks name, in the order first seen, a trailing `/` dropped. */
export function collectSectionFiles(tasks: PlanTask[]): string[] {
  const files: string[] = [];
  for (const task of tasks) {
    for (const file of task.files) {
      if (!file.endsWith("/") && !files.includes(file)) {
        files.push(file);
      }
    }
  }
  return files;
}

/**
 * Reads the numbered sections of the plan: where each one starts, what its
 * `Depends on:` line says, and which files its own tasks name. The files
 * come straight off `PlanTask.files` — the same extraction `coverage-rules.ts`
 * reads `task.links` off — grouped by which section's line range a task
 * falls in, not by matching its number against the section's. A span that
 * ends in `/` is dropped: a directory is not a file two sections can
 * conflict over.
 *
 * `file` names the artifact `content` came from, stamped onto every section
 * as both `file` and `headingFile` - the two only differ once `readPlanSource`
 * resolves a section out of a file its heading merely links to. It defaults
 * to the empty string for the callers that never read either field.
 */
export function parseSections(content: string, tasks: PlanTask[], file: string = ""): PlanSection[] {
  const lines = splitTextLines(content);
  const headings: { number: string; line: number }[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = SECTION_HEADING.exec(lines[index]!);
    if (match) {
      headings.push({ number: match[1]!, line: index + 1 });
    }
  }

  return headings.map((heading, index) => {
    const nextHeadingLine = headings[index + 1]?.line ?? lines.length + 1;
    const sectionTasks = tasks.filter(
      (task) => task.line > heading.line && task.line < nextHeadingLine,
    );
    const firstTaskLine = sectionTasks[0]?.line ?? nextHeadingLine;
    const depends = readDependsOn(lines, heading.line, firstTaskLine);

    return {
      number: heading.number,
      headingLine: heading.line,
      dependsOnLine: depends.dependsOnLine,
      dependsOnRepeated: depends.dependsOnRepeated,
      dependsOnUnreadable: depends.dependsOnUnreadable,
      dependsOn: depends.dependsOn,
      files: collectSectionFiles(sectionTasks),
      tasks: sectionTasks,
      file,
      headingFile: file,
    };
  });
}
