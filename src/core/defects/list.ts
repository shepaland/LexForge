import { answerPath } from "../answer-path.js";
import type { CommandResult } from "../types.js";
import { oneLine } from "../validation/finding.js";
import { findWorkspaceRoot } from "../workspace/find-root.js";
import { readDefectLedger, type DefectEntry } from "./store.js";

export interface ListDefectsOptions {
  /** Any directory inside the project; the workspace root is looked up from it. */
  cwd: string;
  /** Narrows to one change. Unlike `record` and `close`, this is a filter, not a requirement. */
  change?: string;
  /** Narrows to entries whose state is `open`. */
  open?: boolean;
}

export interface ListDefectsData {
  outputVersion: 1;
  workspaceRoot: string;
  defects: DefectEntry[];
  nextStep: string;
}

/**
 * Every entry the project's ledger holds, narrowed by `--change` and
 * `--open` when given. A project with no `lexforge/defects.json` yet lists
 * nothing and exits `0`: `readDefectLedger` already reads a missing file as
 * an empty ledger, and a list is not the command that should be the first
 * to complain about that.
 */
export function listDefects(options: ListDefectsOptions): CommandResult<ListDefectsData> {
  const root = findWorkspaceRoot(options.cwd);
  const ledger = readDefectLedger(root);

  const defects = ledger.defects.filter(
    (entry) =>
      (options.change === undefined || entry.change === options.change) &&
      (!options.open || entry.state === "open"),
  );

  // A listing's only self-contained follow-up is closing an entry it just
  // showed as still open; naming the first one beats naming none.
  const firstOpen = defects.find((entry) => entry.state === "open");
  const nextStep = firstOpen ? `lexforge defect close ${firstOpen.id}` : "";

  const data: ListDefectsData = {
    outputVersion: 1,
    workspaceRoot: answerPath(root),
    defects,
    nextStep,
  };

  // "No defects recorded." is a fact about the whole project, and it is only
  // true when the ledger itself is empty. `archive` points a reader here with
  // `--open`, and a reader under time pressure takes an unqualified "nothing
  // recorded" as "this project has nothing on record" — when three entries
  // may stand just outside whatever was filtered on.
  return {
    data,
    lines: renderDefectList(defects, options, ledger.defects.length === 0),
    // A listing reports what stands; the only follow-up it can name on its
    // own is closing an entry it just showed as still open.
    nextStep,
    exitCode: 0,
  };
}

/**
 * One line per entry: identifier, change, level, state, place, summary — the
 * seven fields the requirement names, in the order a reader scans a table.
 * Columns are padded to the widest value in the list being printed, the way
 * `workspaceStatus` and `check evidence` already line theirs up.
 */
function renderDefectList(
  defects: DefectEntry[],
  filter: { change?: string; open?: boolean },
  ledgerEmpty: boolean,
): string[] {
  if (defects.length === 0) {
    return [emptyMessage(filter, ledgerEmpty)];
  }

  const idWidth = Math.max(...defects.map((entry) => entry.id.length));
  const changeWidth = Math.max(...defects.map((entry) => entry.change.length));
  const levelWidth = Math.max(...defects.map((entry) => entry.level.length));
  const stateWidth = Math.max(...defects.map((entry) => entry.state.length));

  return defects.map(
    (entry) =>
      `${entry.id.padEnd(idWidth)}  ${entry.change.padEnd(changeWidth)}  ` +
      `${entry.level.padEnd(levelWidth)}  ${entry.state.padEnd(stateWidth)}  ` +
      `${oneLine(entry.file)}:${entry.line}  ${oneLine(entry.summary)}`,
  );
}

/**
 * What an empty list says. A ledger with nothing in it says so outright; a
 * ledger that has entries but none matching the filter names the filter, so
 * "nothing here" is never read as "nothing on record anywhere".
 */
function emptyMessage(filter: { change?: string; open?: boolean }, ledgerEmpty: boolean): string {
  if (ledgerEmpty) {
    return "No defects recorded yet.";
  }

  const scope = filter.change ? ` in ${filter.change}` : "";
  const kind = filter.open ? "open " : "";
  return `No ${kind}defects${scope}.`;
}
