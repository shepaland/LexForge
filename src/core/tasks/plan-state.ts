import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { UsageError } from "../../cli/errors.js";
import { readPlanSource } from "../gates/plan-source.js";
import { readTextFile, splitTextLines } from "../read-text.js";
import { readJson, save } from "./files.js";
import { changeDir, planStatePath } from "./paths.js";
import { FindingSchema, type Finding } from "./records.js";

const CODE = "plan-state-unreadable";

export type Angle = "specs" | "code" | "dependencies" | "gaps" | "amendment";
export const ANGLES: readonly Angle[] = ["specs", "code", "dependencies", "gaps", "amendment"];

const PlanReviewSchema = z
  .object({
    angle: z.enum(["specs", "code", "dependencies", "gaps", "amendment"]),
    reviewer: z.string(),
    verdict: z.enum(["approved", "changes-requested"]),
    findings: z.array(FindingSchema),
    digest: z.string(),
    file: z.string(),
    at: z.string(),
  })
  .strict();

const TaskTexts = z.record(z.string(), z.string());

const ApprovalSchema = z
  .object({ quote: z.string(), digest: z.string(), base: z.string(), taskTexts: TaskTexts, at: z.string() })
  .strict();

const AmendmentSchema = z
  .object({ quote: z.string(), digest: z.string(), taskTexts: TaskTexts, at: z.string() })
  .strict();

export const PlanStateSchema = z
  .object({
    version: z.literal(1),
    reviews: z.array(PlanReviewSchema),
    approval: ApprovalSchema.nullable(),
    amendments: z.array(AmendmentSchema),
    migratedFrom: z.literal("5.x").nullable(),
  })
  .strict();

export type PlanReview = z.infer<typeof PlanReviewSchema>;
export type Approval = z.infer<typeof ApprovalSchema>;
export type Amendment = z.infer<typeof AmendmentSchema>;
export type PlanState = z.infer<typeof PlanStateSchema>;
// The review Finding of records.ts is the one stored here.
export type { Finding };

const TICK = /^(\s*-\s*\[)[xX](\])/;

function tasksFile(root: string, change: string): string {
  const file = path.join(root, changeDir(change), "tasks.md");
  if (!existsSync(file)) {
    throw new UsageError(
      "artifact-missing",
      `change "${change}" has no plan written yet: ${file} is absent.`,
      `lexforge instructions tasks --change ${change}`,
    );
  }
  return file;
}

/** The plan files in reading order: `tasks.md`, then every section file once. */
function planFiles(root: string, change: string): string[] {
  const index = tasksFile(root, change);
  const files = [index];
  for (const section of readPlanSource(index).sections) {
    if (!files.includes(section.file)) files.push(section.file);
  }
  return files;
}

/** A hash of the plan text. A ticked checkbox reads as an open one, so progress does not move it. */
export function planDigest(root: string, change: string): string {
  const hash = createHash("sha256");
  for (const file of planFiles(root, change)) {
    const text = splitTextLines(readTextFile(file))
      .map((line) => line.replace(TICK, "$1 $2"))
      .join("\n");
    hash.update(`${path.relative(root, file)}\0${text}\0`);
  }
  return hash.digest("hex");
}

/** Task number to the hash of the task text, which holds no checkbox. */
export function planTaskTexts(root: string, change: string): Record<string, string> {
  const texts: Record<string, string> = {};
  for (const task of readPlanSource(tasksFile(root, change)).tasks) {
    if (task.number !== "") texts[task.number] = createHash("sha256").update(task.text).digest("hex");
  }
  return texts;
}

export function emptyPlanState(): PlanState {
  return { version: 1, reviews: [], approval: null, amendments: [], migratedFrom: null };
}

export function readPlanState(root: string, change: string): PlanState {
  const file = planStatePath(root, change);
  return existsSync(file) ? readJson(file, PlanStateSchema, CODE) : emptyPlanState();
}

export function writePlanState(root: string, change: string, state: PlanState): void {
  save(planStatePath(root, change), PlanStateSchema.parse(state));
}

/** The digest the plan was last accepted at: the last amendment, else the approval. */
export function acceptedDigest(state: PlanState): string | null {
  return state.amendments.at(-1)?.digest ?? state.approval?.digest ?? null;
}

export function approveCommand(change: string): string {
  return `lexforge plan approve --change ${change} --quote "<owner's words>"`;
}

export function amendCommand(change: string): string {
  return `lexforge plan amend --change ${change} --quote "<owner's words>"`;
}

export function reviewCommand(change: string, angle: Angle): string {
  return `lexforge plan review --change ${change} --angle ${angle} --file <report.md>`;
}

/** A report clears its angle when it approves and holds no critical or important finding. */
export function clearsAngle(review: { verdict: string; findings: Finding[] }): boolean {
  return review.verdict === "approved" && !review.findings.some((f) => f.level !== "minor");
}

/** Whether the latest amendment is cleared by the latest amendment report of exactly its digest. */
export function amendmentReviewed(state: PlanState): boolean {
  const last = state.amendments.at(-1);
  if (!last) return true;
  const latest = state.reviews.filter((review) => review.angle === "amendment").at(-1);
  return latest !== undefined && latest.digest === last.digest && clearsAngle(latest);
}

/** Refuses a task command unless the plan on disk is the plan the owner approved. */
export function assertPlanApproved(root: string, change: string): void {
  const state = readPlanState(root, change);
  const accepted = acceptedDigest(state);
  if (state.approval === null || accepted === null) {
    throw new UsageError(
      "plan-not-approved",
      `the plan of change "${change}" has not been approved by the owner, so no task can start.`,
      approveCommand(change),
    );
  }
  if (planDigest(root, change) !== accepted) {
    throw new UsageError(
      "plan-changed",
      `the plan of change "${change}" changed after it was accepted, so no task can start.`,
      amendCommand(change),
    );
  }
  if (!amendmentReviewed(state)) {
    throw new UsageError(
      "amendment-not-reviewed",
      `the latest amendment of the plan of change "${change}" has no approved review.`,
      reviewCommand(change, "amendment"),
    );
  }
}
