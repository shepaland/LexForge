import { refuse } from "./files.js";
import type { Review } from "./state.js";

type Finding = Review["findings"][number];

/** A finding that keeps a cycle from closing; `cycle` limits it to one cycle. */
export function isBlocking(f: Finding, cycle?: string): boolean {
  return (
    !f.resolved &&
    (f.level === "critical" || f.level === "important") &&
    (cycle === undefined || f.cycle === undefined || f.cycle === cycle)
  );
}

/**
 * A fixes report must account for every blocking finding of the earlier
 * report, and there must be one to account for.
 */
export function checkFixesReport(previous: Review, report: Review): void {
  const blocking = previous.findings.filter((f) => isBlocking(f));
  if (blocking.length === 0)
    refuse(
      "The earlier report has no blocking finding, so there is nothing to re-review",
    );
  const left = blocking.filter(
    (f) =>
      !report.findings.some(
        (r) => r.id === f.id && r.cycle === f.cycle && r.resolved,
      ),
  );
  if (left.length > 0)
    refuse(
      `The fixes report does not mark resolved: ${left.map((f) => f.id).join(", ")}`,
    );
}
