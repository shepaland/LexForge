import { splitTextLines } from "../read-text.js";
import { readFiles, readNamedFiles } from "./task-files.js";

/**
 * A checkbox line of `tasks.md`: the mark, an optional number, a run of zero
 * or more `[label]` markers right after it, and the rest of the line. The run
 * is its own capture so it never leaks into the number: `3.1 [A]` still
 * parses `3.1`. It is read out into individual labels by `LABEL_TOKEN` below,
 * so `[A] [B]` gives two labels rather than collapsing to one.
 *
 * A label is at most eight characters of letters, digits or hyphens - `[A]`,
 * `[store]`, `[cli]`. Anything longer, such as `[reference]`, or anything
 * with a space inside, is not a label: the run stops matching there and the
 * bracket stays in the task's text as ordinary prose. The eight-character
 * bound is deliberate, not incidental - the gate rules of the next cycle and
 * the plan template both read labels through this same pattern.
 *
 * Two extra optional groups sit before the number and before the label run:
 * a `(move)` written in either wrong spot would otherwise block the group
 * right after it from matching at all - the number group needs digits right
 * where `(move)` stands, and the label run needs `[` right where it stands.
 * Capturing it there instead lets the number and the label run parse as if
 * it were never in the way; `parseTaskList` below folds the captured text
 * back into the task's own words, since a misplaced `(move)` is not the
 * declaration and must stay visible to whoever wrote it - even on a line
 * that also carries the real declaration in its proper place.
 */
const TASK_LINE =
  /^\s*-\s*\[( |x|X)\]\s*(\(move\)\s*)?([\d.]+)?\s*(\(move\)\s*)?((?:\[[A-Za-z0-9-]{1,8}\]\s*)*)(.*)$/;

/** Pulls every label out of the bracket run `TASK_LINE` captured. */
const LABEL_TOKEN = /\[([A-Za-z0-9-]{1,8})\]/g;

/**
 * The `(move)` declaration, read only where it stands: right after a
 * *non-empty* group label run, before the task's own words. It is the plan
 * author's statement that a task carries code from one file to another with
 * no change in behaviour, so no red run can ever pin it. Cut out here, it
 * never reaches `text`, `cleanText` or `firstLine` - a task's wording is
 * never weighed against it, so it must not linger where wording is read.
 *
 * The trailing `(?:\s+|$)` demands a boundary after the closing paren, so
 * `(move):` and `(move)text` fail to match and stay in the task's own words
 * instead of being read as the declaration.
 */
const MOVE_DECLARATION = /^\(move\)(?:\s+|$)/;

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
  /**
   * The labels in the `[...]` markers right after the number, in the order
   * written - `[A] [B]` gives `["A", "B"]`. Empty when the task carries none.
   */
  groups: string[];
  /** Line the task starts on, counted from 1. */
  line: number;
  /** True for `- [x]` in either case. */
  done: boolean;
  /**
   * True when the line carries `(move)` right after the group label run: the
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
   * The task text with the number and the requirement references taken out:
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
  /**
   * File the task's own line lives in: the plan's own artifact file for a
   * plan written whole, or the linked file `readPlanSource` resolved the
   * task's section out of for a plan written as an index. `line` above
   * always counts from this file, never from the index that may point at it.
   */
  file: string;
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

  for (let index = 0; index < lines.length; index += 1) {
    const match = TASK_LINE.exec(lines[index]!);
    if (!match) {
      continue;
    }

    const startLine = index + 1;
    const rawRest = match[6]!.trim();
    const groups = readGroups(match[5] ?? "");
    // Only a non-empty label run can carry the declaration right after it -
    // an empty run means the group label itself is missing or was never
    // reached, so `(move)` here is not standing where the spec puts it.
    const declaresMove = groups.length > 0 && MOVE_DECLARATION.test(rawRest);
    // A `(move)` caught by either of the wrong-spot groups is not the
    // declaration and must not vanish - it goes back in front of the rest
    // of the task's own words, where the author will still see it. This
    // holds even when the line also carries a real declaration right after
    // the label run: that one is cut below, but the misplaced one is not.
    const misplacedMove = (match[2] ?? "") + (match[4] ?? "");
    const cleanedRest = declaresMove ? rawRest.replace(MOVE_DECLARATION, "") : rawRest;
    const rest = (misplacedMove + cleanedRest).trim();
    const own = [rest];

    while (index + 1 < lines.length) {
      const next = lines[index + 1]!;
      if (!CONTINUATION.test(next) || TASK_LINE.test(next)) {
        break;
      }

      own.push(next.trim());
      index += 1;
    }

    tasks.push({
      number: match[3] ?? "",
      groups,
      line: startLine,
      done: match[1] !== " ",
      declaresMove,
      text: join(own),
      firstLine: own[0]!,
      cleanText: join(own.map((part) => part.replace(REQUIREMENT_LINK, "").trim())),
      links: own.flatMap(readLink),
      files: readFiles(own),
      namedFiles: readNamedFiles(own),
      file,
    });
  }

  return tasks;
}

/** Reads every label out of the bracket run `TASK_LINE` captured after the number. */
function readGroups(run: string): string[] {
  return [...run.matchAll(LABEL_TOKEN)].map((match) => match[1]!);
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
