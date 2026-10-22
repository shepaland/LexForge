import { inlineCodeSpans, isCanonicalTaskFile } from "./task-files.js";

/** The sensitive areas a task can say it touches; the reviewer checks each one. */
export type Control = "authorization" | "cryptography" | "tenant-isolation" | "migrations";

const CONTROLS: readonly Control[] = ["authorization", "cryptography", "tenant-isolation", "migrations"];

export type TaskFieldName = "Test" | "Command" | "Depends on" | "Controls";

export interface FieldProblem {
  field: TaskFieldName;
  kind: "repeated" | "malformed" | "unknown-control";
  value?: string;
}

/** What a task says about its test, command, order and controls. */
export interface TaskFields {
  tests: string[];
  command: string | null;
  dependsOn: string[] | null;
  controls: Control[];
  fieldProblems: FieldProblem[];
}

const FIELD_LINE = /^(Test|Command|Depends on|Controls):\s*(.+)$/;
const TASK_NUMBER = /^\d+(\.\d+)+$/;
const ONE_SPAN = /^`([^`]+)`$/;

/** Reads the four field lines out of the lines of one task. The first line of a field wins. */
export function readTaskFields(lines: string[]): TaskFields {
  const fields: TaskFields = {
    tests: [],
    command: null,
    dependsOn: null,
    controls: [],
    fieldProblems: [],
  };
  const seen = new Set<TaskFieldName>();

  for (const raw of lines) {
    const match = FIELD_LINE.exec(raw.trim());
    if (!match) continue;
    const field = match[1] as TaskFieldName;
    const value = match[2]!.trim();

    if (seen.has(field)) {
      fields.fieldProblems.push({ field, kind: "repeated" });
      continue;
    }
    seen.add(field);

    if (field === "Test") {
      const paths = inlineCodeSpans([value]);
      if (paths.length === 0 || !paths.every(isCanonicalTaskFile)) {
        fields.fieldProblems.push({ field, kind: "malformed" });
      } else {
        fields.tests = [...new Set(paths)];
      }
    } else if (field === "Command") {
      const span = ONE_SPAN.exec(value);
      if (span && span[1]!.trim() !== "") fields.command = span[1]!.trim();
      else fields.fieldProblems.push({ field, kind: "malformed" });
    } else if (field === "Depends on") {
      const numbers = value.split(",").map((part) => part.trim());
      if (numbers.every((number) => TASK_NUMBER.test(number))) {
        fields.dependsOn = [...new Set(numbers)];
      } else {
        fields.fieldProblems.push({ field, kind: "malformed" });
      }
    } else {
      readControls(value, fields);
    }
  }

  return fields;
}

function readControls(value: string, fields: TaskFields): void {
  const names = value.split(",").map((part) => part.trim());
  if (names.some((name) => name === "")) {
    fields.fieldProblems.push({ field: "Controls", kind: "malformed" });
    return;
  }
  for (const name of names) {
    if ((CONTROLS as readonly string[]).includes(name)) {
      if (!fields.controls.includes(name as Control)) fields.controls.push(name as Control);
    } else {
      fields.fieldProblems.push({ field: "Controls", kind: "unknown-control", value: name });
    }
  }
}
