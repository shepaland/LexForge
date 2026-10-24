import { readFileSync } from "node:fs";
import { UsageError } from "../../cli/errors.js";
import { featureBranchName } from "../git/feature-branch.js";
import { readGit, tryGit } from "../git/repository.js";
import { currentBranch, diffFiles, isAncestor, mergeTaskBranch, removeTaskWorktree } from "../git/task-worktree.js";
import type { PlanTask } from "../gates/task-list.js";
import { saveText } from "./files.js";
import { withChangeLock } from "./lock.js";
import { changeDir } from "./paths.js";
import { finalPackageStep, writeFinalPackage } from "./final-review.js";
import { findPlanTask, startNextStep, taskReadiness } from "./plan-ready.js";
import { writeTaskRecord, type TaskRecord } from "./records.js";
import { assertWorktreeClean, headOf, requireInProgress, taskCommand } from "./task-guards.js";

export interface CloseResult {
  merge: string;
  progress: { closed: number; total: number };
  nextStep: string;
}

type PlanLine = Pick<PlanTask, "file" | "line" | "number">;

const UNTICKED = /^(\s*-\s*)\[ \]/;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The lines of the plan, after checking that the task's line is still its open box. */
function openTaskLines(task: PlanLine, change: string): string[] {
  const lines = readFileSync(task.file, "utf8").split("\n");
  const text = lines[task.line - 1] ?? "";
  if (!new RegExp(`^\\s*-\\s*\\[ \\]\\s+${escapeRegExp(task.number)}(?:\\s|$)`).test(text)) {
    throw new UsageError(
      "plan-line-moved",
      `line ${task.line} of ${task.file} no longer holds the open box of task ${task.number}: "${text.trim()}".`,
      `lexforge status --change ${change}`,
    );
  }
  return lines;
}

/** `- [ ] ` becomes `- [x] ` on the task's line, counted from 1, once the line is checked to hold the task. */
export function tickTask(task: PlanLine, change: string): void {
  const lines = openTaskLines(task, change);
  lines[task.line - 1] = lines[task.line - 1]!.replace(UNTICKED, "$1[x]");
  saveText(task.file, lines.join("\n"));
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

function assertMainWorktree(root: string, change: string): void {
  const feature = featureBranchName(change);
  const branch = currentBranch(root);
  if (branch !== feature) {
    throw new UsageError(
      "change-branch-not-checked-out",
      `the main worktree is on ${branch ?? "a detached HEAD"}, and a task merges into ${feature}.`,
      `git checkout ${feature}`,
    );
  }
  const dirty = dirtyOutside(root, change);
  if (dirty.length > 0) {
    throw new UsageError(
      "change-branch-not-checked-out",
      `the main worktree holds uncommitted changes outside lexforge/changes/${change}/: ${dirty.join(", ")}.`,
      "git status",
    );
  }
}

function assertCommitsExist(record: TaskRecord, change: string): void {
  const commits = [record.base, record.red?.commit, record.green?.commit].filter((c): c is string => Boolean(c));
  const missing = commits.filter((commit) => !tryGit(record.worktree, ["cat-file", "-e", `${commit}^{commit}`]).ok);
  if (missing.length > 0) {
    throw new UsageError(
      "task-commit-missing",
      `the recorded commits ${missing.join(", ")} of task ${record.id} are not in the repository.`,
      taskCommand("abandon", change, record.id),
    );
  }
}

/** The git checks of the task branch: red before code, the test frozen after red, only declared files. */
function assertHistory(task: PlanTask, record: TaskRecord, change: string, tip: string): void {
  const id = record.id;
  const cwd = record.worktree;
  const tests = new Set(task.tests);
  if (!task.declaresMove) {
    if (record.red === null) {
      throw new UsageError("red-missing", `task ${id} has no red record.`, taskCommand("red", change, id));
    }
    const red = record.red.commit;
    if (!isAncestor(cwd, red, tip)) {
      throw new UsageError(
        "red-not-ancestor",
        `the red commit ${red.slice(0, 12)} of task ${id} is no longer in the history of its branch.`,
        taskCommand("abandon", change, id),
      );
    }
    const code = diffFiles(cwd, record.base, red).filter((file) => !tests.has(file));
    if (code.length > 0) {
      throw new UsageError(
        "code-before-red",
        `the red commit of task ${id} already changes ${code.join(", ")}, which is not its test.`,
        taskCommand("abandon", change, id),
      );
    }
    const changed = diffFiles(cwd, red, tip).filter((file) => tests.has(file));
    if (changed.length > 0) {
      throw new UsageError(
        "test-changed-after-red",
        `${changed.join(", ")} changed after the red run of task ${id}.`,
        `commit the test alone, then run: ${taskCommand("red", change, id)}`,
      );
    }
  }
  const declared = new Set([...task.files, ...task.tests]);
  const undeclared = diffFiles(cwd, record.base, tip).filter((file) => !declared.has(file));
  if (undeclared.length > 0) {
    throw new UsageError(
      "undeclared-file",
      `task ${id} changes ${undeclared.join(", ")}, which its Files: and Test: lines do not declare.`,
      `lexforge plan amend --change ${change} --quote "<owner's words>"`,
    );
  }
}

/** The latest review approves the current green, comes from someone else and leaves nothing above minor open. */
function assertReviewed(record: TaskRecord, change: string, tip: string): void {
  const id = record.id;
  if (record.green === null || record.green.commit !== tip) {
    throw new UsageError(
      "review-stale",
      `the tip of task ${id} is ${tip.slice(0, 12)}, and no green run was recorded on it.`,
      taskCommand("green", change, id),
    );
  }
  const last = record.reviews.at(-1);
  const send = `send lexforge/changes/${change}/tasks/${id}/review.md to a reviewer, then run: ` +
    `${taskCommand("review", change, id)} --file <report.md>`;
  if (last === undefined || last.green !== record.green.commit || last.reviewer === record.executor) {
    throw new UsageError(
      "review-stale",
      `no review by another person covers the green commit ${tip.slice(0, 12)} of task ${id}.`,
      send,
    );
  }
  const open = last.findings.filter((finding) => finding.level !== "minor");
  if (last.verdict !== "approved" || open.length > 0) {
    throw new UsageError(
      "findings-open",
      `the latest review of task ${id} is ${last.verdict}` +
        (open.length > 0 ? ` with open findings: ${open.map((f) => `${f.id} ${f.level}: ${f.message}`).join("; ")}` : "") +
        ".",
      `fix the findings in the worktree, commit, run: ${taskCommand("green", change, id)}`,
    );
  }
}

function defectSteps(record: TaskRecord, change: string, next: string): string {
  const minors = record.reviews.at(-1)?.findings.filter((finding) => finding.level === "minor") ?? [];
  const steps = minors.map(
    (finding) =>
      `lexforge defect record --change ${change} --level minor --file <file> --line <n> ` +
      `--summary "${finding.message.replace(/"/g, '\\"')}"`,
  );
  return [...steps, next].join(", then run: ");
}

/** Checks the task in git, merges it into the change branch, ticks it and removes its worktree. */
export function closeTask(root: string, change: string, taskId: string): CloseResult {
  return withChangeLock(root, change, "task close", () => {
    const task = findPlanTask(root, change, taskId);
    const record = requireInProgress(root, change, taskId);
    assertMainWorktree(root, change);
    assertWorktreeClean(record.worktree, taskId);
    assertCommitsExist(record, change);
    const tip = headOf(record.worktree);
    assertHistory(task, record, change, tip);
    assertReviewed(record, change, tip);
    openTaskLines(task, change);

    const merged = mergeTaskBranch(root, record.branch, `Task ${taskId}: ${task.firstLine}`);
    if (!merged.merged) {
      throw new UsageError(
        "merge-conflict",
        `merging task ${taskId} into ${featureBranchName(change)} conflicts on ${merged.conflicts.join(", ")}; ` +
          "nothing was merged.",
        `lexforge journal add --change ${change} --kind question --text "<what the plan missed>"`,
      );
    }
    tickTask(task, change);
    removeTaskWorktree(root, record.worktree, record.branch);
    writeTaskRecord(root, change, { ...record, closed: { merge: merged.commit, at: new Date().toISOString() } });

    const states = [...taskReadiness(root, change).values()];
    const closed = states.filter((state) => state === "closed").length;
    let next = startNextStep(root, change);
    if (closed === states.length) {
      writeFinalPackage(root, change);
      next = finalPackageStep(change);
    }
    return { merge: merged.commit, progress: { closed, total: states.length }, nextStep: defectSteps(record, change, next) };
  });
}
