import { fencedLines } from "../markdown-fences.js";
import { splitTextLines } from "../read-text.js";
import { type FileDeclarationProblem, readNamedFiles, readTaskFileScope } from "./task-files.js";
import { type Control, type FieldProblem, readTaskFields } from "./task-fields.js";

export type { Control, FieldProblem } from "./task-fields.js";

/**
 * A checkbox line of `tasks.md`: the mark, an optional `(move)` written before
 * the number, an optional number, and the rest of the line. A bracket after
 * the number is the task's own words. The `(move)` before the number is not
 * the declaration and stays visible in the task's text; `parseTaskList` folds
 * it back in.
 */
const TASK_LINE = /^\s*-\s*\[( |x|X)\]\s*(\(move\)\s*)?([\d.]+)?\s*(.*)$/;

/**
 * The `(move)` declaration, read only where it stands: right after the
 * number, before the task's own words. It is the plan author's statement that
 * a task carries code from one file to another with no change in behaviour,
 * so no red run can ever pin it. Cut out here, it never reaches `text`,
 * `cleanText` or `firstLine`.
 *
 * The trailing `(?:\s+|$)` demands a boundary after the closing paren, so
 * `(move):` and `(move)text` stay in the task's own words.
 */
const MOVE_DECLARATION = /^\(move\)(?:\s+|$)/;

/**
 * A line of the task's fields. The paths and commands on it are not what the
 * author wrote about the work, so `cleanText` leaves it out and a task is not
 * long enough just because it names its files.
 */
const FIELD_LINE = /^(Files|Test|Command|Depends on|Controls):/;

/** A task carries on over an indented line that starts no new list item. */
const CONTINUATION = /^\s+\S/;

/**
 * A requirement reference at the end of a line: `-> capability#Requirement`.
 * The arrow does not turn up in ordinary task text, and reading the end of the
 * line leaves the task itself free to be written any way the author likes.
 */
const REQUIREMENT_LINK = /->\s*([a-z0-9][a-z0-9/-]*)#(.+?)\s*$/;

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
  /**
   * True when the line carries `(move)` right after the number: the
   * task only carries code from one file to another, so the fifth dimension
   * of `verify` does not check it for a red record. Read as written - a
   * task's own wording never overrides or supplies it.
   */
  declaresMove: boolean;
  /** The whole task text, continuation lines joined with a space. */
  text: string;
  /**
   * The first line of the task, without the number. A finding names it, so the
   * reader recognises the task without opening the file.
   */
  firstLine: string;
  /**
   * The task text with the number, the requirement references and the field
   * lines taken out:
   * what the author actually wrote about the work. Rules that measure the
   * task read this, so a reference does not pass for a description.
   */
  cleanText: string;
  /** Requirement references found in the task. */
  links: RequirementLink[];
  /**
   * File paths the task WRITES: bare backtick spans only, a whole `Check:`
   * command left out. `section-concurrent-file` reads this - two sections
   * running the same test file through `Check:` is not a conflict, only two
   * sections writing it is. See `namedFiles` below for every file a task
   * names, its commands included.
   */
  files: string[];
  /**
   * Every file the task NAMES, its `Check:` commands included: a file named
   * only inside a command span - `` Check: `npx vitest run x.test.ts` `` -
   * reaches this field even though it is left out of `files` above, because
   * the whole command sits in one backtick span with whitespace in it.
   * `checkGroupSharedFiles` reads this field, because a TDD triple's three
   * tasks are tied together precisely by the file their `Check:` commands
   * run, not by which of them happens to write it in plain prose too.
   */
  namedFiles: string[];
  /** Problems in an explicit Files declaration; presence suppresses legacy inference. */
  fileDeclarationProblems: FileDeclarationProblem[];
  /**
   * File the task's own line lives in: the plan's own artifact file for a
   * plan written whole, or the linked file `readPlanSource` resolved the
   * task's section out of for a plan written as an index. `line` above
   * always counts from this file, never from the index that may point at it.
   */
  file: string;
  /** Test files named on the `Test:` line. */
  tests: string[];
  /** The one command on the `Command:` line, or `null` when the task has none. */
  command: string | null;
  /** Task numbers on the `Depends on:` line, or `null` when the task has no such line. */
  dependsOn: string[] | null;
  /** Controls named on the `Controls:` line. */
  controls: Control[];
  /** Repeated, malformed or unknown field values, in the order found. */
  fieldProblems: FieldProblem[];
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
 *
 * `file` names the file `content` came from, stamped onto every task
 * returned; it defaults to the empty string for the many callers that never
 * read `task.file` at all. `readPlanSource` is the only caller that passes
 * it, once for the plan's own content and once per file a section's heading
 * links out to.
 */
export function parseTaskList(content: string, file: string = ""): PlanTask[] {
  const tasks: PlanTask[] = [];
  const lines = splitTextLines(content);
  const fenced = fencedLines(lines);

  for (let index = 0; index < lines.length; index += 1) {
    if (fenced.has(index)) continue;
    const match = TASK_LINE.exec(lines[index]!);
    if (!match) {
      continue;
    }

    const startLine = index + 1;
    const rawRest = match[4]!.trim();
    const declaresMove = MOVE_DECLARATION.test(rawRest);
    // A `(move)` before the number is not the declaration and must not
    // vanish - it goes back in front of the task's own words, where the
    // author will still see it.
    const misplacedMove = match[2] ?? "";
    const cleanedRest = declaresMove ? rawRest.replace(MOVE_DECLARATION, "") : rawRest;
    const rest = (misplacedMove + cleanedRest).trim();
    const own = [rest];

    while (index + 1 < lines.length) {
      const next = lines[index + 1]!;
      if (!CONTINUATION.test(next) || (!fenced.has(index + 1) && TASK_LINE.test(next))) {
        break;
      }

      own.push(next.trim());
      index += 1;
    }

    const fileScope = readTaskFileScope(own);
    const fields = readTaskFields(own);
    tasks.push({
      number: match[3] ?? "",
      line: startLine,
      done: match[1] !== " ",
      declaresMove,
      text: join(own),
      firstLine: own[0]!,
      cleanText: join(
        own.filter((part) => !FIELD_LINE.test(part)).map((part) => part.replace(REQUIREMENT_LINK, "").trim()),
      ),
      links: own.flatMap(readLink),
      files: fileScope.files,
      namedFiles: [...new Set([...fileScope.namedFiles, ...fields.tests, ...commandFiles(fields.command)])],
      fileDeclarationProblems: fileScope.fileDeclarationProblems,
      file,
      ...fields,
    });
  }

  return tasks;
}

/** Files a `Command:` span names; the program and the script it runs are not files the task names. */
function commandFiles(command: string | null): string[] {
  return command === null ? [] : readNamedFiles([`\`${command}\``]);
}

/** Joins the lines of a task into one line, dropping the empty ones. */
function join(parts: string[]): string {
  return parts.filter((part) => part !== "").join(" ");
}

/** Reads the requirement reference off one line of a task, if there is one. */
function readLink(line: string): RequirementLink[] {
  const match = REQUIREMENT_LINK.exec(line);
  if (!match) {
    return [];
  }

  return [{ capability: match[1]!, requirement: match[2]!.trim() }];
}
