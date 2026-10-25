import { existsSync } from "node:fs";
import path from "node:path";
import { nextStepForChange } from "../next-step.js";
import { readChangeState } from "../status/change-status.js";
import { activeEntries, readJournal, type JournalEntry } from "./journal.js";
import { finalFindingsStep, finalReviewClears, finalReviewCommand, readFinalReviews } from "./final-review.js";
import { changeDir } from "./paths.js";
import { firstReadyTask, startCommand } from "./plan-ready.js";
import { pendingAngles } from "./plan-review.js";
import {
  acceptedDigest,
  amendCommand,
  amendmentReviewed,
  approveCommand,
  planDigest,
  readPlanState,
  reviewCommand,
} from "./plan-state.js";
import { computeProgress, type Progress } from "./progress.js";
import { listTaskRecords, type TaskRecord } from "./records.js";
import { readWorkflowFile } from "./workflow-file.js";

export type Stage = "red" | "green" | "review" | "close";

export interface ResumeData {
  change: string;
  progress: Progress;
  nextStep: string;
  running: Array<{ task: string; stage: Stage; worktree: string }>;
  decisions: JournalEntry[];
  questions: JournalEntry[];
  promises: JournalEntry[];
  permissions: JournalEntry[];
  rulings: JournalEntry[];
}

/** What the task needs next: a red run, a green run, a review of the current green, or the close. */
export function taskStage(record: TaskRecord): Stage {
  if (record.red === null) return "red";
  if (record.green === null) return "green";
  const last = record.reviews.at(-1);
  const approves =
    last !== undefined &&
    last.green === record.green.commit &&
    last.reviewer !== record.executor &&
    last.verdict === "approved" &&
    !last.findings.some((finding) => finding.level !== "minor");
  return approves ? "close" : "review";
}

function taskCommand(verb: string, change: string, id: string): string {
  return `lexforge task ${verb} --change ${change} --task ${id}`;
}

function stepFor(record: TaskRecord, stage: Stage, change: string): string {
  const id = record.id;
  if (stage === "red") return `commit the failing test, then run: ${taskCommand("red", change, id)}`;
  if (stage === "green") return `commit the implementation, then run: ${taskCommand("green", change, id)}`;
  if (stage === "close") return taskCommand("close", change, id);
  const last = record.reviews.at(-1);
  if (last !== undefined && last.green === record.green!.commit && last.reviewer !== record.executor) {
    return `fix the findings in the worktree, commit, then run: ${taskCommand("green", change, id)}`;
  }
  return (
    `send lexforge/changes/${change}/tasks/${id}/review.md to a reviewer, then run: ` +
    `${taskCommand("review", change, id)} --file <report.md>`
  );
}

function questionStep(change: string, question: JournalEntry): string {
  return `ask the owner ${question.id}, then run: lexforge journal resolve --change ${change} --id ${question.id} --note "<answer>"`;
}

/** The one command that moves the change on, chosen by the first rule that applies. */
function chooseNextStep(root: string, change: string, progress: Progress, records: TaskRecord[]): string {
  const state = readPlanState(root, change);
  const digest = planDigest(root, change);
  if (readWorkflowFile(root, change).path === "full") {
    const pending = pendingAngles(state, digest);
    if (state.approval === null && pending.length > 0) return reviewCommand(change, pending[0]!);
    if (state.approval === null) return approveCommand(change);
  }
  if (state.approval !== null) {
    if (digest !== acceptedDigest(state)) return amendCommand(change);
    if (!amendmentReviewed(state)) return reviewCommand(change, "amendment");
  }
  const running = records.filter((record) => record.closed === null && record.executor !== "");
  const first = running[0];
  if (first !== undefined) return stepFor(first, taskStage(first), change);
  const ready = firstReadyTask(root, change);
  if (ready !== null) return startCommand(change, ready);
  if (progress.total > 0 && progress.closed === progress.total) {
    const last = readFinalReviews(root, change).at(-1);
    if (last === undefined) return finalReviewCommand(change);
    return finalReviewClears(last) ? `lexforge verify --change ${change}` : finalFindingsStep(change);
  }
  return `lexforge status --change ${change}`;
}

const EMPTY: Progress = { total: 0, closed: 0, inProgress: 0, waiting: 0, blocked: 0, sections: [] };

/** Everything an agent needs after the context was cut: progress, the one next command, the journal. */
export function resume(root: string, change: string): ResumeData {
  readWorkflowFile(root, change);
  const records = listTaskRecords(root, change);
  const journal = readJournal(root, change);
  const active = activeEntries(journal, records);
  const of = (kind: JournalEntry["kind"]): JournalEntry[] => active.filter((entry) => entry.kind === kind);
  const questions = of("question");
  const running = records
    .filter((record) => record.closed === null && record.executor !== "")
    .map((record) => ({ task: record.id, stage: taskStage(record), worktree: record.worktree }));

  const planWritten = existsSync(path.join(root, changeDir(change), "tasks.md"));
  const progress = planWritten ? computeProgress(root, change) : EMPTY;
  const question = questions[0];
  const nextStep =
    question !== undefined
      ? questionStep(change, question)
      : planWritten
        ? chooseNextStep(root, change, progress, records)
        : nextStepForChange(change, readChangeState(root, change).state);

  return {
    change,
    progress,
    nextStep,
    running,
    decisions: of("decision"),
    questions,
    promises: of("promise"),
    permissions: of("permission"),
    rulings: of("ruling"),
  };
}
