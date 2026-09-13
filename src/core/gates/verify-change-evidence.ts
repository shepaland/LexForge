import { workspacePath } from "../answer-path.js";
import { readHead } from "../git/repository.js";
import { worktreeDigest } from "../git/worktree-digest.js";
import { makeFinding, type Finding } from "../validation/finding.js";
import { evidenceFile, readLedger } from "./evidence-store.js";
import { freshnessFinding, labelState, type CodeState } from "./freshness.js";
import { readRedRuns } from "./red-run-store.js";
import type { PlanTask, PlanTasks } from "./task-list.js";

/**
 * The third measure: what the ledger says about every check the project
 * describes. No command is run here. A gate that runs the test suite takes
 * minutes, and a check that slow is the one an agent learns to leave out.
 * This reads `evidence.json` only — a red record answers for one task, this
 * dimension answers for the whole tree, and it never opens `red-runs.json`.
 */
export function evidenceFindings(root: string, change: string, labels: string[]): Finding[] {
  const current: CodeState = { head: readHead(root), worktreeDigest: worktreeDigest(root) };
  const ledger = readLedger(root, change);
  const file = workspacePath(root, evidenceFile(root, change));

  const findings: Finding[] = [];

  for (const label of labels) {
    const record = ledger.records[label];
    const finding = freshnessFinding({
      file,
      change,
      label,
      state: labelState(record, current),
      record,
      current,
    });

    if (finding) {
      findings.push(finding);
    }
  }

  return findings;
}

/** Prefix of every path inside a change's own directory, forward slashes, trailing slash. */
function changeDirPrefix(change: string): string {
  return `lexforge/changes/${change}/`;
}

/**
 * Whether this dimension has anything to answer for on this task: the file
 * the task writes — the first file its line names, `Check:` commands
 * included — sits outside `tests/` and outside the change's own directory.
 * Every file named after the first is the subject a test pins or a run
 * fails on, not work the task wrote, so it never enters this check. A task
 * whose first named file is a test, whose first named file sits inside the
 * change directory, or that names no file at all is a run, a test, or
 * paperwork — none of it is the production work a red run has to precede.
 * A task carrying the `(move)` declaration is skipped the same way: it
 * states its own work is carrying code between files, which leaves no run
 * to watch fail.
 */
function namesCheckedFile(task: PlanTask, change: string): boolean {
  if (task.declaresMove) {
    return false;
  }

  const prefix = changeDirPrefix(change);
  const written = task.namedFiles[0];
  return written !== undefined && !written.startsWith("tests/") && !written.startsWith(prefix);
}

/**
 * The fifth measure: a ticked task that names real production work but
 * carries no red record — or one whose record's exit code is `0`, which
 * counts as none — is a finding. This dimension reads only `red-runs.json`
 * through `red-run-store.ts`; it never opens `evidence.json`, and the label
 * stamp read by `evidenceFindings` never opens this file either. No age of
 * the change waives it: a task ticked before the store existed is checked
 * the same as one ticked today.
 */
export function redRecordFindings(root: string, change: string, plan: PlanTasks): Finding[] {
  const store = readRedRuns(root, change);

  return plan.tasks
    .filter((task) => task.done && namesCheckedFile(task, change))
    .filter((task) => {
      const record = store.records[task.number];
      return !record || record.exitCode === 0;
    })
    .map((task) =>
      makeFinding(
        task.file || plan.file,
        task.line,
        "task-no-red-record",
        task.number
          ? `Task ${task.number} is ticked, names a file outside tests/ and outside this ` +
              "change's own directory, and carries no red record. Record one: " +
              `lexforge evidence red --change ${change} --task ${task.number} ` +
              `--command "<the command whose failure this task closes>"`
          : `The task at line ${task.line} is ticked, names a file outside tests/ and outside ` +
              "this change's own directory, and carries no task number, so no red record " +
              "can be recorded for it. Give it a number such as \"3.4\" in tasks.md.",
      ),
    );
}
