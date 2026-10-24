# Reviewer brief

Send this to a reviewer once `lexforge task green` has written
`lexforge/changes/<name>/tasks/<id>/review.md`, before `lexforge task close`. The reviewer
is a subagent on the model of the `verify` stage and is never the task's executor:
`lexforge task review` refuses a report signed by the executor with
`reviewer-is-executor`. Where no agent can be reached, the task stops at its review.

## What goes in

| Slot | Where it comes from |
|---|---|
| `[ENGINEERING_RULES]` | the engineering rules already listed below, the same selection `lexforge task start` wrote into the task's `brief.md` over the task's files |

The rest of the package is the whole input: the brief path, the executor's report, the
diff from the base to green, `Since the last review` when there is one, and the report
format. Add only the paths of the change's delta specs and `design.md`, which the brief
already quotes.

## What stays out

Leave out the history of your session, your reasoning about the code, anything said
about the deadline or the size of the work, other tasks, and earlier reviews. A reviewer
who reads your reasoning grades your reasoning; one who reads the last three reviews
learns their tone. If the reviewer asks for more, send the package again.

## The brief

```
You review one task of a LexForge change. Read the package:

lexforge/changes/[CHANGE]/tasks/[ID]/review.md

It names the task's brief: read the brief too, for the task, its requirements and the
design decisions that bind it.

## How you work

Read only. Do not edit the worktree, do not stage, do not move HEAD or any branch.
Inspect with `git show`, `git diff` and `git log`.

Run no test, no build, no script of the change. Read the diff in the package and the
output of the run the executor already performed, which `task red` and `task green`
recorded and the executor's report quotes.

Do all of this yourself. Start no subagent: not to split the diff, not for a second
opinion.

## What to check

- Does the diff do what the requirements say, all of it and nothing besides?
- Does it break any decision of the brief?
- Does the test fail without the implementation, and does it assert the behaviour of the
  requirement, not the shape of the code?
- Parameters, flags and branches nobody asked for.
- Error paths, boundary values, and the cases the scenarios name.
- Every file of the diff is in the task's `Files:` or `Test:`.

A re-review: when the package has a section `Since the last review`, check that diff
against the findings of the earlier review, and say for each finding whether it is
closed, with `file:line`. The rest of the diff was reviewed already.

## Engineering rules

[ENGINEERING_RULES]

Every listed rule whose sign appears in the diff is a finding that names the rule ID,
the file and the line, and the failure the sign points to. It is CRITICAL or IMPORTANT -
never a warning, never MINOR - and `task close` refuses with `findings-open` until a fix
closes it. A rule not listed here is not yours to raise.

## Controls

The package lists the controls the task names: authorization, cryptography,
tenant-isolation, migrations. Check each one yourself and, above `Findings:`, write one
line per control you checked:

Control: <name> — confirmed

followed by the files and lines you read for it. List the same names on the
`Controls:` line. A control you did not check is not confirmed, and an approved report
without it is refused.

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

An answer with no `file:line` anywhere is empty: send the brief again and say the review
came back with no specific finding. A verdict resting on the reviewer's own run is sent
back the same way: ask for one that reads the diff and the recorded runs instead.

Save the answer to a file and register it with
`lexforge task review --change <name> --task <id> --file <report.md>`, then run the
command `nextStep` names. CRITICAL and IMPORTANT are fixed, committed, taken through
`task green` and reviewed again. MINOR is fixed now or recorded with:

    lexforge defect record --change <name> --level minor --file <path> --line <number> --summary "<text>"

If a finding is wrong, answer it with the requirement quoted, the test, or the line of
code that disproves it, never with silence.
