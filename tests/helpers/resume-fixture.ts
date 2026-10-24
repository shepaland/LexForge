import { writeTaskRecord, type RunRecord, type TaskRecord, type TaskReview } from "../../src/core/tasks/records.js";
import { CHANGE } from "./plan-fixture.js";

export const ANGLES_FOR_TESTS = ["specs", "code", "dependencies", "gaps"] as const;

export function RUN(commit: string): RunRecord {
  return { commit, exitCode: 0, tail: "", log: "", at: "2026-10-22T10:00:00.000Z" };
}

export function review(green: string, verdict: "approved" | "changes-requested"): TaskReview {
  return { reviewer: "rev-1", verdict, green, controls: [], findings: [], at: "2026-10-22T10:30:00.000Z" };
}

/** Writes the record of a started task, with whatever the test sets on top. */
export function putRecord(root: string, id: string, patch: Partial<TaskRecord>): void {
  writeTaskRecord(root, CHANGE, {
    id,
    origin: "native",
    executor: "exec-1",
    branch: `lexforge/${CHANGE}/${id}`,
    worktree: "/nowhere",
    base: "abc",
    startedAt: "2026-10-22T10:00:00.000Z",
    red: null,
    green: null,
    reviews: [],
    closed: null,
    attempts: 0,
    ...patch,
  });
}
