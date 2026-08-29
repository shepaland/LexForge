/**
 * Every rule of this stage reports at the same level. A level that does not
 * fail the check is a ready-made way around the gate: the skill would read
 * exit code `0` and carry a half-written artifact further down the pipeline.
 */
export type FindingLevel = "error";

/** One rule violation, tied to the place in the file that has to be fixed. */
export interface Finding {
  /** Path to the file, in the form the reader is shown. */
  file: string;
  /** Line number, counted from 1. */
  line: number;
  level: FindingLevel;
  /** Rule id, such as `requirement-without-scenario`. */
  rule: string;
  /** One plain sentence naming what to fix. */
  message: string;
}

/** Builds a finding. The level is fixed: this stage has no softer one. */
export function makeFinding(file: string, line: number, rule: string, message: string): Finding {
  return { file, line, level: "error", rule, message };
}
