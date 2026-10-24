# Final review brief

Send this once every task is closed and
`lexforge review final --change <name>` has written
`lexforge/changes/<name>/final-review.md`. The reviewer is a subagent on the model of the
`verify` stage and executed no task of the change: `lexforge review final --file`
refuses a report signed by an executor with `reviewer-is-executor`.

The package holds the tasks with their executors and the whole diff from the base to the
change branch. It does not hold the requirements: add the paths of the change's delta
specs (`lexforge/changes/<name>/specs/**/spec.md`) and of `design.md` where it says
`[SPECS]` and `[DESIGN]`. Leave out the history of the session, the task reviews and
anything said about the deadline.

```
You review a whole LexForge change before it is called done. Read the package:

lexforge/changes/[CHANGE]/final-review.md

and the requirements and decisions it must meet:

[SPECS]
[DESIGN]

## How you work

Read only. Do not edit the worktree, do not stage, do not move HEAD or any branch.
Inspect with `git show`, `git diff` and `git log`. Run no test, no build, no script of
the change. Do all of this yourself; start no subagent.

## What to check

Each task was reviewed alone. You look at what no task review could see:

- Every requirement and every scenario of the delta specs is met somewhere in the diff.
  Name the requirement no file meets.
- Every decision of `design.md` holds across the diff, including where two tasks meet.
- Two tasks that solved one problem twice, or left a gap between them.
- Code in the diff that no requirement asks for.
- Error paths and boundary values the scenarios name.

## Levels

CRITICAL: wrong behaviour, data loss, a requirement not met, a decision broken.
IMPORTANT: a gap that will cost work later: a missing test, an unhandled error path.
MINOR: naming, duplication, comments, small simplifications.

Every finding names `file:line`, what is wrong, and why it matters.

## Answer

Write the report in the format of the package's `Report` section: `Reviewer:`,
`Verdict:`, `Controls:`, `Findings:`. `Verdict: approved` only when no CRITICAL or
IMPORTANT is open. An answer that names no file and line will be sent back.
```

## Reading the answer

An answer with no `file:line` anywhere, or a verdict resting on the reviewer's own run,
is sent back. Save the answer to a file and register it with
`lexforge review final --change <name> --file <report.md>`, then run the command
`nextStep` names. A CRITICAL or IMPORTANT finding becomes a new task through
`lexforge plan amend`, and that task goes through start, red, green, review and close
like any other; then the final review runs again on the new package. MINOR is fixed in a
task now or recorded with `lexforge defect record --level minor`. When the review
clears, `nextStep` is `lexforge verify --change <name>`.
