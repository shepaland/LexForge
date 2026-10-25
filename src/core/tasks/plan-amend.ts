import { UsageError } from "../../cli/errors.js";
import { withChangeLock } from "./lock.js";
import { changeDir } from "./paths.js";
import {
  acceptedDigest,
  approveCommand,
  planDigest,
  planTaskTexts,
  readPlanState,
  reviewCommand,
  writePlanState,
} from "./plan-state.js";
import { listTaskRecords } from "./records.js";

export interface PlanAmendResult {
  digest: string;
  changedTasks: string[];
  nextStep: string;
}

export function amendPlan(root: string, change: string, quote: string | undefined): PlanAmendResult {
  changeDir(change);
  const words = (quote ?? "").trim();
  if (words === "") {
    throw new UsageError(
      "quote-required",
      "an amendment records the owner's own words, and the quote is empty.",
      `lexforge plan amend --change ${change} --quote "<owner's words>"`,
    );
  }

  return withChangeLock(root, change, "plan amend", () => {
    const state = readPlanState(root, change);
    if (state.approval === null) {
      throw new UsageError(
        "plan-not-approved",
        `the plan of change "${change}" is not approved yet, so there is nothing to amend.`,
        approveCommand(change),
      );
    }
    const digest = planDigest(root, change);
    if (digest === acceptedDigest(state)) {
      throw new UsageError(
        "plan-unchanged",
        `the plan of change "${change}" is the plan that was last accepted, so there is nothing to amend.`,
        `edit tasks.md or a section file of change "${change}", then run: lexforge plan amend --change ${change} --quote "<owner's words>"`,
      );
    }

    const before = state.amendments.at(-1)?.taskTexts ?? state.approval.taskTexts;
    const after = planTaskTexts(root, change);
    const closedChanged = listTaskRecords(root, change)
      .filter((record) => record.closed !== null && before[record.id] !== undefined && before[record.id] !== after[record.id])
      .map((record) => record.id);
    if (closedChanged.length > 0) {
      throw new UsageError(
        "closed-task-changed",
        `the text of closed task ${closedChanged.join(", ")} changed; a closed task keeps its text.`,
        "restore the text of the closed task, or add a new task for the new work, then run: " +
          `lexforge plan amend --change ${change} --quote "<owner's words>"`,
      );
    }

    const changedTasks = Object.keys(after).filter((id) => before[id] !== after[id]);
    state.amendments.push({ quote: words, digest, taskTexts: after, at: new Date().toISOString() });
    writePlanState(root, change, state);
    return { digest, changedTasks, nextStep: reviewCommand(change, "amendment") };
  });
}
