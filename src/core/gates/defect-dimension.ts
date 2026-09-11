import { readDefectLedger, type DefectLevel } from "../defects/store.js";
import { makeFinding, oneLine, type Finding } from "../validation/finding.js";

/** Rule id this dimension's findings carry. */
export const DEFECT_OPEN_RULE = "defect-open";

/** Levels that stop a gate while an entry of that level stands open. */
const BLOCKING_LEVELS: readonly DefectLevel[] = ["critical", "important"];

/**
 * The fourth dimension `verify` and `archive` share: an open `critical` or
 * `important` entry naming this change is a finding, the same way an open
 * checkbox or a stale stamp is. An open `minor` entry is never one — the
 * level was set when the defect was recorded, and no gate lowers it. Read
 * through `readDefectLedger` so both callers see the same ledger, the same
 * way, with no flag anywhere that skips it.
 */
export function defectFindings(root: string, change: string): Finding[] {
  const ledger = readDefectLedger(root);

  return ledger.defects
    .filter(
      (entry) =>
        entry.change === change && entry.state === "open" && BLOCKING_LEVELS.includes(entry.level),
    )
    .map((entry) =>
      makeFinding(
        oneLine(entry.file),
        entry.line,
        DEFECT_OPEN_RULE,
        `defect ${entry.id} (${entry.level}) is open: ${oneLine(entry.summary)}. Fix it, ` +
          `then run: lexforge defect close ${entry.id}`,
      ),
    );
}
