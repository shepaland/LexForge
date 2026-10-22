import path from "node:path";

export type TaskArtifact = "brief.md" | "review.md" | "red.log" | "green.log";

export function changeDir(change: string): string {
  return `lexforge/changes/${change}`;
}

function inChange(root: string, change: string, ...parts: string[]): string {
  return path.join(root, changeDir(change), ...parts);
}

export function taskRecordPath(root: string, change: string, id: string): string {
  return inChange(root, change, "tasks", `${id}.json`);
}

export function taskArtifactPath(root: string, change: string, id: string, name: TaskArtifact): string {
  return inChange(root, change, "tasks", id, name);
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

export function lockPath(root: string, change: string): string {
  return inChange(root, change, "change.lock");
}

export function taskWorktreePath(root: string, change: string, id: string): string {
  return path.join(root, ".lexforge", "worktrees", change, id);
}

export function taskBranchName(change: string, id: string): string {
  return `lexforge/${change}/${id}`;
}
