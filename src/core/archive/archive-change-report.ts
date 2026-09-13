import { DEFECT_OPEN_RULE } from "../gates/defect-dimension.js";
import type { Finding } from "../validation/finding.js";
import type { ArchiveChangeData, ArchiveChangeSummary } from "./archive-change.js";

/** Counters the skill reads to learn which measure it has to go back to. */
export function summarise(
  checks: Finding[],
  conflicts: number,
  specsWritten: number,
): ArchiveChangeSummary {
  const count = (rule: string): number =>
    checks.filter((finding) => finding.rule === rule).length;

  return {
    openTasks: count("task-not-done"),
    requirementsWithoutTrace: count("requirement-without-trace"),
    staleLabels: count("evidence-not-fresh"),
    conflicts,
    specsWritten,
    openDefects: count(DEFECT_OPEN_RULE),
  };
}

/**
 * The findings under the file they were found in, or what the merge did when
 * there are none. A conflict is named as a conflict: it is fixed in the delta
 * of the change, and editing the main spec by hand to get past it writes a
 * requirement nobody wrote in a change.
 *
 * `openDefectsProjectWide` is not part of `data`: it is the project-wide
 * count `design.md` commits to naming on every archival, which is a
 * different number from `data.summary.openDefects` and has no reader that
 * needs it as a machine-readable field.
 */
export function renderLines(
  data: ArchiveChangeData,
  written: string[],
  openDefectsProjectWide: number,
): string[] {
  if (data.findings.length === 0) {
    const ledgerLine =
      openDefectsProjectWide === 0
        ? "No defects are open in the project ledger."
        : `${openDefectsProjectWide} defect${openDefectsProjectWide === 1 ? "" : "s"} ` +
          `${openDefectsProjectWide === 1 ? "is" : "are"} open in the project ledger. ` +
          "Run: lexforge defect list --open";

    return [
      `Change "${data.change}" is archived.`,
      ...written.map((file) => `  merged into ${file}`),
      `The change now lives in ${data.archivePath}.`,
      ledgerLine,
    ];
  }

  const lines: string[] = [];
  let file = "";

  for (const finding of data.findings) {
    if (finding.file !== file) {
      file = finding.file;
      lines.push(file);
    }
    lines.push(`  ${finding.line}  ${finding.level}  ${finding.rule}  ${finding.message}`);
  }

  if (data.summary.conflicts > 0) {
    lines.push(
      "",
      "A conflict is fixed in the delta specs of the change. The main spec is " +
        "not edited by hand to get the merge through.",
    );
  }

  return lines;
}
