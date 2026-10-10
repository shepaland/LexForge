import { copyFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { active, selected } from "./cycles.js";
import { UsageError } from "../../cli/errors.js";
import { checkFixesReport, isBlocking } from "./fixes-review.js";
import { hashFile, local, refuse } from "./files.js";
import { changeDir, executionPlan, taskSource } from "./plan.js";
import { currentGreen } from "./proofs.js";
import { parseReview, readState, writeState, type Review } from "./state.js";

/**
 * Registers one review report for every cycle without controls whose tasks
 * fall in section `sectionNumber` of tasks.md. Nothing is written until all
 * covered cycles pass their checks.
 */
export function reviewWave(
  root: string,
  change: string,
  sectionNumber: string,
  file: string,
) {
  const section = taskSource(root, change).sections.find(
    (s) => s.number === sectionNumber,
  );
  if (!section) refuse(`Unknown section: ${sectionNumber}`);
  const covered = executionPlan(root, change, true).filter(
    (c) =>
      c.controls.length === 0 &&
      c.tasks.some((id) => section.tasks.some((t) => t.number === id)),
  );
  if (covered.length === 0)
    refuse(`Section ${sectionNumber} has no cycle without controls`);
  const report = parseReview(local(root, file));
  const directory = `${changeDir(change)}/execution/wave-${sectionNumber}`;
  const fixes = report.scope === "fixes";
  let previous: Review | undefined;
  if (fixes) {
    if (!report.previous)
      refuse("A fixes report must name the earlier report in previous");
    if (path.posix.dirname(path.posix.normalize(report.previous)) !== directory)
      refuse(`The earlier report must be a file registered in ${directory}`);
    previous = parseReview(local(root, report.previous));
    checkFixesReport(previous, report);
  }
  for (const f of report.findings) {
    if (f.cycle === undefined) continue;
    if (!covered.some((c) => c.id === f.cycle))
      refuse(
        `Finding ${f.id} names cycle ${f.cycle}, which this wave does not cover`,
      );
    if (readState(root, change, f.cycle)?.closedAt)
      refuse(`Finding ${f.id} names cycle ${f.cycle}, which is already closed`);
  }
  const checked = covered.flatMap((c) => {
    selected(root, change, c.id);
    const s = readState(root, change, c.id);
    if (s?.closedAt) return [];
    if (!s) refuse(`Cycle ${c.id} is not started`);
    active(root, change, c);
    const green = currentGreen(root, change, c, s);
    if (!green)
      throw new UsageError(
        "execution-invalid",
        `Cycle ${c.id} lacks current GREEN (an edit by a sibling cycle makes it stale)`,
        `lexforge cycle run --change ${change} --cycle ${c.id} --phase green`,
      );
    if (previous) {
      if (
        s.reviewFile !== path.posix.normalize(report.previous ?? "") ||
        s.reviewFileHash !== hashFile(root, s.reviewFile)
      )
        refuse(
          `Cycle ${c.id}: previous is not the report registered on this cycle`,
        );
      if (
        s.review?.greenLogHash === green.logHash &&
        previous.findings.some((f) => isBlocking(f, c.id))
      )
        refuse(
          `Cycle ${c.id}: no fix round since the earlier report; fix the findings and run GREEN again`,
        );
    }
    if (!s.patch || hashFile(root, s.patch) !== s.patchHash)
      refuse(`Cycle ${c.id} has a missing or modified patch`);
    const missing = fixes
      ? undefined
      : c.acceptance.find((a) => !report.acceptance.includes(a.id));
    if (missing)
      refuse(`Cycle ${c.id}: the review misses acceptance ${missing.id}`);
    if (report.reviewer === s.executor)
      refuse(`Cycle ${c.id}: the review must be independent of its executor`);
    return [{ s, green }];
  });
  if (checked.length === 0)
    refuse(`Every cycle of section ${sectionNumber} is already closed`);
  mkdirSync(local(root, directory), { recursive: true });
  const dest = `${directory}/review-${randomUUID()}.json`;
  copyFileSync(local(root, file), local(root, dest));
  const fileHash = hashFile(root, dest);
  for (const { s, green } of checked) {
    s.review = { report, greenLogHash: green.logHash, file: dest, fileHash };
    s.reviewFile = dest;
    s.reviewFileHash = fileHash;
    // A fix round is reviewed from the state this report was registered on:
    // the next GREEN builds its patch from this baseline. `before` stays.
    if (report.findings.some((f) => isBlocking(f, s.cycle))) {
      s.reviewBase = green.snapshot;
      s.reviewBaseHashes = green.snapshotHashes;
    }
    writeState(root, change, s);
  }
  return {
    wave: sectionNumber,
    file: dest,
    cycles: checked.map(({ s }) => s.cycle),
  };
}
