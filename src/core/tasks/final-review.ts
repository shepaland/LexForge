import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { UsageError } from "../../cli/errors.js";
import { DEV, featureBranchName } from "../git/feature-branch.js";
import { readGit, tryGit } from "../git/repository.js";
import { readJson, save, saveText } from "./files.js";
import { withChangeLock } from "./lock.js";
import { finalReviewPackagePath, finalReviewPath } from "./paths.js";
import { readChangePlan, startCommand, startNextStep, taskReadiness } from "./plan-ready.js";
import { amendCommand, clearsAngle, readPlanState } from "./plan-state.js";
import { FindingSchema, listTaskRecords, type Finding } from "./records.js";
import { parseReviewReport, type ReviewReport } from "./review-report.js";
import { isShortPath } from "./short-path.js";

const FinalReviewSchema = z
  .object({
    reviewer: z.string(),
    verdict: z.enum(["approved", "changes-requested"]),
    head: z.string(),
    base: z.string(),
    findings: z.array(FindingSchema),
    at: z.string(),
  })
  .strict();

const FinalReviewFileSchema = z.object({ version: z.literal(1), reviews: z.array(FinalReviewSchema) }).strict();

export type FinalReview = z.infer<typeof FinalReviewSchema>;
export type FinalReviewFile = z.infer<typeof FinalReviewFileSchema>;

export interface FinalReviewResult {
  verdict: FinalReview["verdict"];
  findings: Finding[];
  nextStep: string;
}

export function finalReviewCommand(change: string): string {
  return `lexforge review final --change ${change} --file <report.md>`;
}

/** The step after the package is written: send it, then register the report. */
export function finalPackageStep(change: string): string {
  return `send lexforge/changes/${change}/final-review.md to a reviewer, then run: ${finalReviewCommand(change)}`;
}

/** The step after a final review that leaves blocking findings: one new task per finding. */
export function finalFindingsStep(change: string): string {
  return `add a task for each finding, then run: ${amendCommand(change)}`;
}

/** The final reviews of a change in the order they were registered; no file reads as none. */
export function readFinalReviews(root: string, change: string): FinalReview[] {
  const file = finalReviewPath(root, change);
  if (!existsSync(file)) return [];
  return readJson(file, FinalReviewFileSchema, "final-review-unreadable").reviews;
}

/** Whether a final review lets the change go to verify: approved, nothing critical or important. */
export function finalReviewClears(review: FinalReview): boolean {
  return clearsAngle(review);
}

/**
 * The commit the final review compares the change branch with: the merge-base
 * with dev for a change migrated from 5.x, the approval base otherwise, and on
 * the short path without an approval the base of the one task record.
 */
export function finalReviewBase(root: string, change: string): string {
  const state = readPlanState(root, change);
  if (state.migratedFrom === "5.x") {
    const base = tryGit(root, ["merge-base", DEV, featureBranchName(change)]);
    if (!base.ok) {
      throw new UsageError(
        "dev-branch-missing",
        `change "${change}" was migrated from 5.x, and ${featureBranchName(change)} has no merge-base with ${DEV}.`,
        `git branch ${DEV} main, then run: lexforge review final --change ${change}`,
      );
    }
    return base.output.trim();
  }
  if (state.approval !== null) return state.approval.base;
  if (isShortPath(root, change)) {
    const record = listTaskRecords(root, change)[0];
    if (record !== undefined) return record.base;
  }
  throw new UsageError(
    "plan-not-approved",
    `change "${change}" has no approved plan, so the final review has no base to compare with.`,
    `lexforge plan approve --change ${change} --quote "<owner's words>"`,
  );
}

function byNumber(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? -1) - (right[i] ?? -1);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Refuses while any task of the plan is open, naming the first one by number. */
function assertAllClosed(root: string, change: string): void {
  const open = [...taskReadiness(root, change)].filter(([, state]) => state !== "closed").sort(([a], [b]) => byNumber(a, b));
  const first = open[0];
  if (first === undefined) return;
  const [id, state] = first;
  const nextStep =
    state === "in-progress"
      ? `lexforge resume --change ${change}`
      : state === "ready"
        ? startCommand(change, id)
        : startNextStep(root, change);
  throw new UsageError(
    "tasks-open",
    `task ${id} of change "${change}" is ${state}; the final review covers a change whose tasks are all closed ` +
      `(${open.length} open).`,
    nextStep,
  );
}

function fenced(text: string): string {
  const fence = text.includes("```") ? "~~~~" : "```";
  return `${fence}diff\n${text}\n${fence}`;
}

const REPORT_FORMAT = [
  "Write the report as plain text with these lines:",
  "",
  "```",
  "Reviewer: <your id; not an executor of any task of the change>",
  "Verdict: approved|changes-requested",
  "Controls: none",
  "Findings:",
  "- critical|important|minor: <file:line and what is wrong>",
  "```",
].join("\n");

/** Writes `final-review.md`: the base, the tip, the tasks with their executors and the whole diff. */
export function writeFinalPackage(root: string, change: string): string {
  assertAllClosed(root, change);
  const base = finalReviewBase(root, change);
  const branch = featureBranchName(change);
  const head = readGit(root, ["rev-parse", branch]);
  const records = new Map(listTaskRecords(root, change).map((record) => [record.id, record]));
  const tasks = readChangePlan(root, change)
    .tasks.filter((task) => task.number !== "")
    .map((task) => `- ${task.number} ${task.firstLine} (executor: ${records.get(task.number)?.executor ?? "none"})`);
  const parts = [
    `# Final review of change ${change}`,
    `Base ${base}, tip of ${branch} ${head}.`,
    "## Tasks",
    tasks.join("\n"),
    `## Diff from the base to ${branch}`,
    fenced(readGit(root, ["diff", base, branch])),
    "## Report",
    REPORT_FORMAT,
  ];
  const file = finalReviewPackagePath(root, change);
  saveText(file, `${parts.join("\n\n")}\n`);
  return file;
}

function readReport(file: string, change: string): ReviewReport {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    throw new UsageError(
      "review-report-unreadable",
      `${file} cannot be read: ${(error as NodeJS.ErrnoException).code ?? "read error"}.`,
      `write the report to ${file}, then run: ${finalReviewCommand(change)}`,
    );
  }
  try {
    return parseReviewReport(text, file);
  } catch (error) {
    if (error instanceof UsageError) {
      throw new UsageError(
        error.code,
        error.message,
        `rewrite ${file} in the report format, then run: ${finalReviewCommand(change)}`,
        file,
      );
    }
    throw error;
  }
}

/** Registers the final review of the whole change against the current tip of its branch. */
export function registerFinalReview(root: string, change: string, file: string): FinalReviewResult {
  const report = readReport(path.resolve(file), change);
  return withChangeLock(root, change, "review final", () => {
    assertAllClosed(root, change);
    const reviewer = report.reviewer.trim();
    const executed = listTaskRecords(root, change).filter((record) => record.executor === reviewer);
    if (executed.length > 0) {
      throw new UsageError(
        "reviewer-is-executor",
        `the report is signed by ${reviewer}, who carried out task ${executed.map((r) => r.id).join(", ")}.`,
        `send lexforge/changes/${change}/final-review.md to another reviewer, then run: ${finalReviewCommand(change)}`,
      );
    }
    const review: FinalReview = {
      reviewer,
      verdict: report.verdict,
      head: readGit(root, ["rev-parse", featureBranchName(change)]),
      base: finalReviewBase(root, change),
      findings: report.findings,
      at: new Date().toISOString(),
    };
    save(finalReviewPath(root, change), { version: 1, reviews: [...readFinalReviews(root, change), review] });
    const nextStep = finalReviewClears(review) ? `lexforge verify --change ${change}` : finalFindingsStep(change);
    return { verdict: review.verdict, findings: review.findings, nextStep };
  });
}
