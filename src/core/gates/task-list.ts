import { splitTextLines } from "../read-text.js";

/** A checkbox line of `tasks.md`: the mark, an optional number, the rest of the line. */
const TASK_LINE = /^\s*-\s*\[( |x|X)\]\s*([\d.]+)?\s*(.*)$/;

/** A task carries on over an indented line that starts no new list item. */
const CONTINUATION = /^\s+\S/;

/**
 * A requirement reference at the end of a line: `-> capability#Requirement`.
 * The arrow does not turn up in ordinary task text, and reading the end of the
 * line leaves the task itself free to be written any way the author likes.
 */
const REQUIREMENT_LINK = /->\s*([a-z0-9][a-z0-9/-]*)#(.+?)\s*$/;

/** Anything written in backticks. Both file names and commands turn up here. */
const INLINE_CODE = /`([^`]+)`/g;

/** A file extension of two to four letters, such as `.ts`, `.md`, `.yaml`. */
const EXTENSION = /\.[a-zA-Z]{2,4}$/;

/** A reference from a task to a requirement of a delta spec. */
export interface RequirementLink {
  /** Capability path, as written under `specs/`. */
  capability: string;
  /** Requirement name, word for word as in the `### Requirement:` heading. */
  requirement: string;
}

/** One task of the plan, with everything the gates read from it. */
export interface PlanTask {
  /** Task number, such as `3.4`. Empty when the task carries none. */
  number: string;
  /** Line the task starts on, counted from 1. */
  line: number;
  /** True for `- [x]` in either case. */
  done: boolean;
  /** The whole task text, continuation lines joined with a space. */
  text: string;
  /**
   * The first line of the task, without the number. A finding names it, so the
   * reader recognises the task without opening the file.
   */
  firstLine: string;
  /**
   * The task text with the number and the requirement references taken out:
   * what the author actually wrote about the work. Rules that measure the
   * task read this, so a reference does not pass for a description.
   */
  cleanText: string;
  /** Requirement references found in the task. */
  links: RequirementLink[];
  /** File paths named in the task text. */
  files: string[];
}

/**
 * A parsed plan: the tasks and the file they came from. The rules of the plan
 * self-check read this, and every finding they report points at that file.
 */
export interface PlanTasks {
  /** Path to `tasks.md`, in the form the reader is shown. */
  file: string;
  tasks: PlanTask[];
}

/**
 * Reads `tasks.md` into a list of tasks. A markdown parser is no help here: a
 * plan is read for its checkboxes, its numbers and its line numbers, and a
 * finding has to point at the line the reader will open.
 */
export function parseTaskList(content: string): PlanTask[] {
  const tasks: PlanTask[] = [];
  const lines = splitTextLines(content);

  for (let index = 0; index < lines.length; index += 1) {
    const match = TASK_LINE.exec(lines[index]!);
    if (!match) {
      continue;
    }

    const startLine = index + 1;
    const own = [match[3]!.trim()];

    while (index + 1 < lines.length) {
      const next = lines[index + 1]!;
      if (!CONTINUATION.test(next) || TASK_LINE.test(next)) {
        break;
      }

      own.push(next.trim());
      index += 1;
    }

    tasks.push({
      number: match[2] ?? "",
      line: startLine,
      done: match[1] !== " ",
      text: join(own),
      firstLine: own[0]!,
      cleanText: join(own.map((part) => part.replace(REQUIREMENT_LINK, "").trim())),
      links: own.flatMap(readLink),
      files: readFiles(own),
    });
  }

  return tasks;
}

/** Joins the lines of a task into one line, dropping the empty ones. */
function join(parts: string[]): string {
  return parts.filter((part) => part !== "").join(" ");
}

/** Everything written in backticks across the lines of one task, in order. */
export function inlineCodeSpans(lines: string[]): string[] {
  const spans: string[] = [];

  for (const line of lines) {
    for (const match of line.matchAll(INLINE_CODE)) {
      spans.push(match[1]!.trim());
    }
  }

  return spans;
}

/**
 * File paths named in the task. Only what stands in backticks is read, and of
 * that only what looks like a path: it holds a slash or ends in an extension.
 * A command is left out, so `npm test` is not taken for a file.
 */
function readFiles(lines: string[]): string[] {
  const files: string[] = [];

  for (const span of inlineCodeSpans(lines)) {
    if (/\s/.test(span)) {
      continue;
    }

    if (span.includes("/") || EXTENSION.test(span)) {
      files.push(span);
    }
  }

  return [...new Set(files)];
}

/** Reads the requirement reference off one line of a task, if there is one. */
function readLink(line: string): RequirementLink[] {
  const match = REQUIREMENT_LINK.exec(line);
  if (!match) {
    return [];
  }

  return [{ capability: match[1]!, requirement: match[2]!.trim() }];
}
