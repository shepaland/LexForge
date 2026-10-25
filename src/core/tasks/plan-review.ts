import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { UsageError } from "../../cli/errors.js";
import { checkPlan } from "../gates/plan-check.js";
import { normalizeLineEndings } from "../read-text.js";
import type { Finding } from "./records.js";
import { withChangeLock } from "./lock.js";
import { changeDir } from "./paths.js";
import {
  ANGLES,
  amendCommand,
  amendmentReviewed,
  clearsAngle,
  approveCommand,
  planDigest,
  readPlanState,
  reviewCommand,
  writePlanState,
  type Angle,
  type PlanState,
} from "./plan-state.js";
import { startNextStep } from "./plan-ready.js";
import { parseReviewReport } from "./review-report.js";

/** The four angles that precede approval, in the order they are asked for. */
export const APPROVAL_ANGLES: readonly Angle[] = ["specs", "code", "dependencies", "gaps"];

export interface PlanReviewResult {
  angle: Angle;
  verdict: "approved" | "changes-requested";
  findings: Finding[];
  digest: string;
  pending: Angle[];
  nextStep: string;
}

/** The angles whose latest report does not clear the digest. */
export function pendingAngles(state: PlanState, digest: string): Angle[] {
  return APPROVAL_ANGLES.filter((angle) => {
    const latest = state.reviews.filter((review) => review.angle === angle).at(-1);
    return latest === undefined || latest.digest !== digest || !clearsAngle(latest);
  });
}

function latestAt(state: PlanState, angle: Angle, digest: string) {
  const latest = state.reviews.filter((review) => review.angle === angle).at(-1);
  return latest !== undefined && latest.digest === digest ? latest : undefined;
}

/** Angles with no approving report of the current digest. */
export function missingAngles(state: PlanState, digest: string): Angle[] {
  return APPROVAL_ANGLES.filter((angle) => latestAt(state, angle, digest)?.verdict !== "approved");
}

/** Angles whose approving report of the current digest holds a critical or important finding. */
export function openFindingAngles(state: PlanState, digest: string): Angle[] {
  return APPROVAL_ANGLES.filter((angle) => {
    const latest = latestAt(state, angle, digest);
    return latest?.verdict === "approved" && !clearsAngle(latest);
  });
}

function readReport(root: string, file: string): string {
  const full = path.resolve(root, file);
  if (!existsSync(full)) {
    throw new UsageError(
      "review-report-unreadable",
      `the review report ${file} does not exist.`,
      "write the report to a file, then run the command again",
      file,
    );
  }
  return normalizeLineEndings(readFileSync(full, "utf8"));
}

export function registerPlanReview(root: string, change: string, angle: string, file: string): PlanReviewResult {
  if (!(ANGLES as readonly string[]).includes(angle)) {
    throw new UsageError(
      "unknown-angle",
      `"${angle}" is not a review angle of a plan.`,
      `lexforge plan review --change ${change} --angle ${ANGLES.join("|")} --file <report.md>`,
    );
  }
  const asked = angle as Angle;
  changeDir(change);

  if (checkPlan({ cwd: root, change }).exitCode !== 0) {
    throw new UsageError(
      "plan-check-failing",
      `the plan of change "${change}" has findings, so it cannot be reviewed yet.`,
      `lexforge check plan --change ${change}`,
    );
  }
  const text = readReport(root, file);
  const report = parseReviewReport(text, file);

  return withChangeLock(root, change, "plan review", () => {
    const state = readPlanState(root, change);
    const digest = planDigest(root, change);
    const last = state.amendments.at(-1);

    if (asked === "amendment") {
      if (!last || amendmentReviewed(state)) {
        throw new UsageError(
          "no-amendment-pending",
          `change "${change}" has no amendment that waits for a review.`,
          amendCommand(change),
        );
      }
      if (last.digest !== digest) {
        throw new UsageError(
          "plan-changed",
          `the plan of change "${change}" changed after the amendment was recorded.`,
          amendCommand(change),
        );
      }
    }

    let n = state.reviews.filter((review) => review.angle === asked).length + 1;
    const dir = path.join(root, changeDir(change), "plan-reviews");
    while (existsSync(path.join(dir, `${asked}-${n}.md`))) n += 1;
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${asked}-${n}.md`), text);

    state.reviews.push({
      angle: asked,
      reviewer: report.reviewer,
      verdict: report.verdict,
      findings: report.findings,
      digest,
      file: `${changeDir(change)}/plan-reviews/${asked}-${n}.md`,
      at: new Date().toISOString(),
    });
    writePlanState(root, change, state);

    const pending = asked === "amendment" ? [] : pendingAngles(state, digest);
    return {
      angle: asked,
      verdict: report.verdict,
      findings: report.findings,
      digest,
      pending,
      nextStep: nextStepAfter(root, change, asked, clearsAngle(report), pending, state),
    };
  });
}

function nextStepAfter(
  root: string,
  change: string,
  angle: Angle,
  clear: boolean,
  pending: Angle[],
  state: PlanState,
): string {
  if (!clear) {
    // An amendment review is of one digest; once the plan is fixed the digest is a new amendment's.
    return angle === "amendment"
      ? `fix the plan, then run: ${amendCommand(change)}`
      : `fix the plan, then run: ${reviewCommand(change, angle)}`;
  }
  if (angle === "amendment") return startNextStep(root, change);
  if (pending.length > 0) return reviewCommand(change, pending[0]!);
  return state.approval === null ? approveCommand(change) : startNextStep(root, change);
}
