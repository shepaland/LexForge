import path from "node:path";
import { UsageError } from "../../cli/errors.js";

export type TaskArtifact = "brief.md" | "review.md" | "red.log" | "green.log";

function refuse(message: string): never {
  throw new UsageError("execution-invalid", message, "lexforge status");
}

function checkId(id: string): string {
  if (!/^\d+(\.\d+)+$/.test(id)) refuse("Invalid task id");
  return id;
}

export function changeDir(change: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(change)) refuse("Invalid change name");
  return `lexforge/changes/${change}`;
}

function inChange(root: string, change: string, ...parts: string[]): string {
  return path.join(root, changeDir(change), ...parts);
}

export function taskRecordPath(root: string, change: string, id: string): string {
  return inChange(root, change, "tasks", `${checkId(id)}.json`);
}

export function taskArtifactPath(root: string, change: string, id: string, name: TaskArtifact): string {
  return inChange(root, change, "tasks", checkId(id), name);
}

export function planStatePath(root: string, change: string): string {
  return inChange(root, change, "plan-state.json");
}

export function journalPath(root: string, change: string): string {
  return inChange(root, change, "journal.jsonl");
}

export function finalReviewPath(root: string, change: string): string {
  return inChange(root, change, "final-review.json");
}

export function finalReviewPackagePath(root: string, change: string): string {
  return inChange(root, change, "final-review.md");
}

export function lockPath(root: string, change: string): string {
  return inChange(root, change, "change.lock");
}

export function taskWorktreePath(root: string, change: string, id: string): string {
  changeDir(change);
  return path.join(root, ".lexforge", "worktrees", change, checkId(id));
}

export function taskBranchName(change: string, id: string): string {
  changeDir(change);
  return `lexforge/${change}/${checkId(id)}`;
}
