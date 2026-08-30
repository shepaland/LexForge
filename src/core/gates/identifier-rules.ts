import { makeFinding, type Finding } from "../validation/finding.js";
import { inlineCodeSpans, type PlanTasks } from "./task-list.js";

/** Shorter than this a span is a service name, not a name the plan agreed on. */
const MIN_IDENTIFIER_LENGTH = 3;

/** One spelling of a name and the line of the task it was written on. */
interface Spelling {
  text: string;
  line: number;
}

/**
 * Catches one name written two ways across the plan: a field called
 * `resolvedOutputPath` in one task and `resolved_output_path` in another is
 * two fields to whoever carries the plan out. Only what stands in backticks
 * is compared, because ordinary words differ for ordinary reasons.
 */
export function checkIdentifiers(plan: PlanTasks): Finding[] {
  const byKey = new Map<string, Spelling[]>();

  for (const task of plan.tasks) {
    for (const span of inlineCodeSpans([task.text])) {
      if (!isIdentifier(span)) {
        continue;
      }

      const key = keyOf(span);
      const spellings = byKey.get(key);

      if (!spellings) {
        byKey.set(key, [{ text: span, line: task.line }]);
        continue;
      }

      if (!spellings.some((spelling) => spelling.text === span)) {
        spellings.push({ text: span, line: task.line });
      }
    }
  }

  const findings: Finding[] = [];

  for (const spellings of byKey.values()) {
    if (spellings.length < 2) {
      continue;
    }

    const listed = spellings
      .map((spelling) => `${spelling.text} (line ${spelling.line})`)
      .join(", ");

    findings.push(
      makeFinding(
        plan.file,
        spellings[0]!.line,
        "identifier-spelling",
        `One name is written two ways in this plan: ${listed}. Pick one spelling ` +
          "and use it in every task, so nobody builds both.",
      ),
    );
  }

  return findings;
}

/**
 * What is compared at all. A span holding a space is a command, not a name:
 * `lexforge check plan` would otherwise share a key with `checkPlan`. A span
 * shorter than three characters is a short service name: `id` and `ID` are
 * not a disagreement about spelling.
 */
function isIdentifier(span: string): boolean {
  return !/\s/.test(span) && span.length >= MIN_IDENTIFIER_LENGTH;
}

/**
 * What two spellings are compared by: lowercase, without hyphens and
 * underscores. `run.ts` and `run.test.ts` keep different keys on their own.
 */
function keyOf(span: string): string {
  return span.toLowerCase().replace(/[-_]/g, "");
}
