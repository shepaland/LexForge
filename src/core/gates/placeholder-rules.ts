import { makeFinding, type Finding } from "../validation/finding.js";
import { checkTemplatePlaceholders } from "../validation/strict-rules.js";
import type { PlanTask, PlanTasks } from "./task-list.js";

/**
 * A task shorter than this names no work. The threshold is measured against
 * the plans of the earlier stages: the shortest live task there is longer than
 * fifty characters, and "Тесты" or "Собрать" are shorter than thirty.
 */
export const MIN_TASK_LENGTH = 30;

/**
 * A task pointing at another task by its number: the work is named with a
 * pointer instead of a description, and the reader has to guess what carries
 * over. Both languages are covered, because the plan is written in either.
 */
const POINTS_AT_TASK =
  /(?<![\p{L}\p{N}_])(задач\p{L}*|шаг\p{L}*|п\.|task|step)\s*№?\s*\d/u;

/**
 * Markers of work that was named but not written down. The list is built in:
 * a project adds to it through `plan_placeholders`, and there is no way to
 * take a marker out. A list that can shrink is a way around the gate.
 */
export const BUILT_IN_MARKERS = Object.freeze([
  "TBD",
  "TODO",
  "FIXME",
  "XXX",
  "add error handling",
  "similar to task",
  "same as above",
  "and so on",
  "as needed",
  "уточнить",
  "дописать",
  "доделать",
  "по аналогии",
  "аналогично задаче",
  "как в задаче",
  "остальное так же",
  "и так далее",
  "и т. д.",
  "и прочее",
  "при необходимости",
  "если понадобится",
  "добавить обработку ошибок",
  "разобраться",
]);

/**
 * Reports a finding for every placeholder marker found in a task. The project
 * markers come as the second argument and are added to the built-in list.
 */
export function checkPlaceholders(plan: PlanTasks, projectMarkers: string[] = []): Finding[] {
  const markers = [...BUILT_IN_MARKERS, ...projectMarkers];
  const findings: Finding[] = [];

  for (const task of plan.tasks) {
    findings.push(...checkMarkers(plan.file, task, markers));
    findings.push(...checkPointsAtTask(plan.file, task));
    findings.push(...checkLength(plan.file, task));
    findings.push(...checkTemplate(plan.file, task));
  }

  return findings;
}

/**
 * A word list catches the usual wording and misses the reworded one, so three
 * more rules read the task without looking at any particular phrase.
 */
function checkPointsAtTask(file: string, task: PlanTask): Finding[] {
  if (!POINTS_AT_TASK.test(normalise(stripInlineCode(task.cleanText)))) {
    return [];
  }

  return [
    makeFinding(
      file,
      task.line,
      "task-points-at-task",
      "This task points at another task by its number instead of saying what to " +
        "do. Write the work out here, so it can be read on its own.",
    ),
  ];
}

/** A task too short to describe anything. The threshold is named in the text. */
function checkLength(file: string, task: PlanTask): Finding[] {
  const length = task.cleanText.trim().length;
  if (length >= MIN_TASK_LENGTH) {
    return [];
  }

  return [
    makeFinding(
      file,
      task.line,
      "task-too-short",
      `This task is ${length} characters long. Say what is written, in what file, ` +
        `and how it is checked, in ${MIN_TASK_LENGTH} characters or more.`,
    ),
  ];
}

/**
 * Leftovers of the template inside a task, found by the same check the strict
 * mode of `validate` runs. It already leaves a command in backticks alone, so
 * `lexforge new change <name>` is not taken for a placeholder.
 */
function checkTemplate(file: string, task: PlanTask): Finding[] {
  return checkTemplatePlaceholders(file, task.cleanText).map((finding) => ({
    ...finding,
    line: task.line,
  }));
}

/** Every marker that turns up in the task text, in the order of the list. */
function checkMarkers(file: string, task: PlanTask, markers: string[]): Finding[] {
  const text = normalise(stripInlineCode(task.cleanText));

  return markers
    .filter((marker) => matches(text, marker))
    .map((marker) =>
      makeFinding(
        file,
        task.line,
        "task-placeholder",
        `This task says "${marker}" instead of naming the work. Write out what ` +
          "is to be done, or split it into tasks that say it.",
      ),
    );
}

/**
 * Whether the marker stands in the text as a word of its own. The latin `\b`
 * is no help on cyrillic, so the boundary is written out as a lookaround over
 * letters and digits of any script.
 */
function matches(text: string, marker: string): boolean {
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])${escape(normalise(marker))}(?![\\p{L}\\p{N}_])`,
    "u",
  );

  return pattern.test(text);
}

/**
 * Drops what stands in backticks. A file named `todo-list.ts` is the work, not
 * a note to do the work later, and the same goes for a command in a task.
 */
function stripInlineCode(text: string): string {
  return text.replace(/`[^`]*`/g, " ");
}

/**
 * The form both sides are compared in: one case, one letter for «е» and «ё»,
 * one space between words. A plan is written by a person, and the same marker
 * turns up in it capitalised, shouted and split over two lines.
 */
function normalise(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

/** Quotes the marker so a dot or a bracket in it stays a plain character. */
function escape(marker: string): string {
  return marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
