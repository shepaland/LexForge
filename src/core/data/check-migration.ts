import { applyOperations, compareSchemas, emptySchema, type Operation, type Problem } from "./schema-model.js";

export interface MigrationDifference {
  step: "up" | "down";
  /** The step file, such as `down.sql`. */
  file: string;
  message: string;
}

export interface MigrationInput {
  store: string;
  /** Operations that build the project schema, or null when the store has none yet. */
  project: Operation[] | null;
  schema: Operation[];
  up: Operation[];
  down: Operation[];
  /** File extension of the store files, `sql` or `md`. */
  ext: string;
}

function place(table: string, member?: string): string {
  return member === undefined ? table : `${table}.${member}`;
}

function fromProblem(input: MigrationInput, step: "up" | "down", problem: Problem): MigrationDifference {
  const file = `${step}.${input.ext}`;
  const at = place(problem.table, problem.field);
  return {
    step,
    file,
    message: `Store "${input.store}", ${file}: ${problem.message} (${at}) The step does not apply to the schema it starts from.`,
  };
}

/**
 * Applies the forward step to the project schema and compares the result with the
 * change schema, then applies the backward step to the change schema and compares
 * the result with the project schema. One difference per problem and per item.
 */
export function checkMigration(input: MigrationInput): MigrationDifference[] {
  const out: MigrationDifference[] = [];
  const project = input.project ? applyOperations(emptySchema(), input.project).schema : emptySchema();
  const declared = applyOperations(emptySchema(), input.schema).schema;
  const steps = [
    { step: "up" as const, start: project, operations: input.up, goal: declared, goalName: "the change schema" },
    { step: "down" as const, start: declared, operations: input.down, goal: project, goalName: "the project schema" },
  ];
  for (const { step, start, operations, goal, goalName } of steps) {
    const file = `${step}.${input.ext}`;
    const applied = applyOperations(start, operations);
    for (const problem of applied.problems) out.push(fromProblem(input, step, problem));
    for (const diff of compareSchemas(goal, applied.schema)) {
      const member = diff.field ?? diff.key;
      const at = place(diff.table, member);
      const detail = `${at}: expected ${diff.expected}, got ${diff.actual}`;
      out.push({
        step,
        file,
        message: `Store "${input.store}", ${file}: ${diff.message} The step does not lead to ${goalName} (${detail}).`,
      });
    }
  }
  return out;
}
