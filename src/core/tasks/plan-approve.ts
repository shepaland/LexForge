import { UsageError } from "../../cli/errors.js";
import { checkPlan } from "../gates/plan-check.js";
import { DEV, featureBranchName } from "../git/feature-branch.js";
import { readGit, tryGit } from "../git/repository.js";
import { currentBranch } from "../git/task-worktree.js";
import { validateChange } from "../validation/validate-change.js";
import { withChangeLock } from "./lock.js";
import { changeDir } from "./paths.js";
import { missingAngles, openFindingAngles } from "./plan-review.js";
import { startNextStep } from "./plan-ready.js";
import {
  amendCommand,
  planDigest,
  planTaskTexts,
  readPlanState,
  reviewCommand,
  writePlanState,
} from "./plan-state.js";

export interface PlanApproveResult {
  digest: string;
  base: string;
  nextStep: string;
}

function alreadyApproved(change: string): UsageError {
  return new UsageError(
    "plan-already-approved",
    `the plan of change "${change}" is already approved; a later change goes through an amendment.`,
    amendCommand(change),
  );
}

/** Paths git reports as changed or untracked outside the change directory. */
function dirtyOutside(root: string, change: string): string[] {
  const raw = readGit(root, [
    "status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ".", `:(exclude)${changeDir(change)}`,
  ]);
  const parts = raw.split("\0");
  const paths: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const entry = parts[i]!;
    if (entry.length <= 3) continue;
    paths.push(entry.slice(3));
    if ("RC".includes(entry[0]!) || "RC".includes(entry[1]!)) i += 1;
  }
  return paths;
}

/** Files of commits since `dev` that touch anything outside the change directory. */
function committedOutside(root: string, change: string): string[] {
  if (!tryGit(root, ["show-ref", "--verify", "--quiet", `refs/heads/${DEV}`]).ok) {
    throw new UsageError(
      "dev-branch-missing",
      `the branch ${DEV} does not exist, so the commits of ${featureBranchName(change)} cannot be compared with it.`,
      `git branch ${DEV} main`,
    );
  }
  const raw = readGit(root, [
    "log", `${DEV}..HEAD`, "--name-only", "--format=", "--", ".", `:(exclude)${changeDir(change)}`,
  ]);
  return [...new Set(raw.split("\n").filter((line) => line !== ""))].sort();
}

export function approvePlan(root: string, change: string, quote: string | undefined): PlanApproveResult {
  changeDir(change);
  const words = (quote ?? "").trim();
  if (words === "") {
    throw new UsageError(
      "quote-required",
      "an approval records the owner's own words, and the quote is empty.",
      `lexforge plan approve --change ${change} --quote "<owner's words>"`,
    );
  }
  const branch = featureBranchName(change);
  if (currentBranch(root) !== branch) {
    throw new UsageError(
      "change-branch-not-checked-out",
      `the plan is approved on ${branch}, and HEAD stands on ${currentBranch(root) ?? "no branch"}.`,
      `git checkout ${branch}`,
    );
  }
  if (readPlanState(root, change).approval !== null) throw alreadyApproved(change);
  if (checkPlan({ cwd: root, change }).exitCode !== 0) {
    throw new UsageError(
      "plan-check-failing",
      `the plan of change "${change}" has findings, so it cannot be approved.`,
      `lexforge check plan --change ${change}`,
    );
  }
  if (validateChange({ cwd: root, change, strict: true }).exitCode !== 0) {
    throw new UsageError(
      "validate-failing",
      `the artifacts of change "${change}" have findings under the strict validation.`,
      `lexforge validate ${change} --strict`,
    );
  }

  return withChangeLock(root, change, "plan approve", () => {
    const state = readPlanState(root, change);
    const digest = planDigest(root, change);
    if (state.approval !== null) throw alreadyApproved(change);
    const missing = missingAngles(state, digest);
    if (missing.length > 0) {
      throw new UsageError(
        "plan-reviews-missing",
        `no clean approving review of the current plan from these angles: ${missing.join(", ")}.`,
        reviewCommand(change, missing[0]!),
      );
    }
    const open = openFindingAngles(state, digest);
    if (open.length > 0) {
      throw new UsageError(
        "plan-findings-open",
        `an approving review of the current plan still holds a critical or important finding: ${open.join(", ")}.`,
        `fix the plan, then run: ${reviewCommand(change, open[0]!)}`,
      );
    }
    const dirty = dirtyOutside(root, change);
    const early = state.migratedFrom === "5.x" ? [] : committedOutside(root, change);
    if (dirty.length > 0 || early.length > 0) {
      const parts = [
        dirty.length > 0 ? `uncommitted: ${dirty.join(", ")}` : "",
        early.length > 0 ? `committed since ${DEV}: ${early.join(", ")}` : "",
      ].filter((part) => part !== "");
      throw new UsageError(
        "work-before-approval",
        `work outside lexforge/changes/${change}/ exists before the plan is approved (${parts.join("; ")}).`,
        "move that work out of the change branch, then run: " +
          `lexforge plan approve --change ${change} --quote "<owner's words>"`,
      );
    }

    const base = readGit(root, ["rev-parse", "HEAD"]);
    state.approval = { quote: words, digest, base, taskTexts: planTaskTexts(root, change), at: new Date().toISOString() };
    writePlanState(root, change, state);
    return { digest, base, nextStep: startNextStep(root, change) };
  });
}

