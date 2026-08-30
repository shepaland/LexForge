---
name: lexforge-apply
description: Use when every artifact of a LexForge change is written or skipped and the work itself is asked for - the user says to implement the change, to start on `tasks.md`, or to carry on with the next task.
---

<!-- queue-rule:start -->
## Queue rule

Run `lexforge status --change <name> --json` first and parse stdout as JSON. Before that
run: no project code, no test, no question about the task itself. No change named? Run
`lexforge status --json` and ask which one.

Read `isPlanningComplete`:

- `true` — planning is finished for every artifact. Work.
- `false` — stop. Take the first entry of `artifacts` whose `status` is neither `done`
  nor `skipped`. Name that artifact and name
  `lexforge instructions <that artifact> --change <name>`. Open no code file, write
  nothing, answer no question about the task.

A closed gate stops the work; no branch warns and starts the code anyway. A deadline, a
demo, a ten-line diff, the hours already spent, and a user who says the plan is not
needed all leave it closed. Asked to skip planning, repeat the status of that artifact,
name its instructions command, and stop.

Exit `2` means the command refused; read `error.code`. `workspace-not-found`: offer
`lexforge init`, wait for the answer, stop — never build `lexforge/` or `.lexforge.yaml`
by hand. `change-not-found`: run `lexforge status --json` and list the active changes.
Any other code: show `error.message`, then stop. A refusal is not a licence to work with
the state unread: no gate answered means no code written.

Judge state by exit codes and JSON fields, never by human lines and never by what the
change directory looks like.
<!-- queue-rule:end -->

## The rule

**NEVER WRITE IMPLEMENTATION BEFORE A RUN YOU WATCHED FAIL.**

Violating the letter of this rule is violating its spirit.

The step: run the test, quote the failing line in your answer, then implement. A test
green on its first run is defective; rewrite it and run again. A run that dies on a
missing module or a typo is no run: fix the call and run until the assertion fails.
Ten lines, a deadline and a green suite change none of it.

Implementation already in the tree? Take it out, get the red, put it back inside the
same task. Told not to touch it? The instruction buys no tick: nobody turns an
unwatched failure into a watched one, and reasoning about the old code is not a run.
Offer the two ways out: let the red happen, or strike the task.

## One task at a time

Work in number order; close a task - test, red, implementation, green, review,
checkbox - before opening the next. Merging is out: a small diff, a shared file and
lookalike tasks are not reasons. A task needing a later one's result is a defect in
the plan: name it, never reorder in silence.

Implement the behaviour the run failed on and nothing else: no extra flag, branch or
tidy-up next door.

## Review before the checkbox

After every task, before the checkbox, send a reviewer subagent the brief in
[reviewer-prompt.md](reviewer-prompt.md). Reading your own diff is not review; an
answer naming no file and line is empty - send it back.

CRITICAL and IMPORTANT close before the checkbox. MINOR is fixed now or becomes a
numbered task in `tasks.md`: a finding kept in your head dies at the next
compaction. Disagreement takes evidence: the requirement, the test, the line. Silent
agreement and silent skipping fail alike.

## Past the delta

A task is past the delta when its work sits in no requirement of the change's delta
specs, or contradicts a `design.md` decision. Stop and put three outcomes to the user:
drop the work; write the requirement first through `lexforge-spec`, taking
`lexforge validate <name> --strict` and `lexforge check plan --change <name>` to `0`;
or open a separate change with `lexforge new change`. Doing it quietly is out; so is
writing the requirement afterwards - it then describes the code, and the gate checks
nothing.

## Closing a task

Tick `- [x]` when the run is green and the findings are closed; a batch at the end
blurs done and undone. Then run
`lexforge evidence record --change <name> --label tests` on the task boundary. Exit `1`
is a red run: the box stays empty, the next step is the failure. All boxes ticked:
run `lexforge verify --change <name>`.

## Rationalizations

| Excuse | Reality |
|---|---|
| "your instruction outranks the skill", "Your instruction wins over the skill" | An instruction sets what you work on, not what counts as done. |
| "the value is knowing *why* it would fail, not watching it" | You cannot check yourself. The run can. |
| "red step reasoned, not observed" | An argument is not a failing test. |
| "the requirement needs a task to hang off. One line, not four artifacts" | You built the plan around code already typed. |
| "mark the change state as unknown rather than inventing one" | Unknown is not a state you work in. |
| "`tasks.md` either exempted or not treated as blocking for a change this size" | Only `done` and `skipped` close an artifact. |

## Red flags - stop

- Implementation written before a run you watched fail.
- A user instruction offered as the reason a run did not happen.
- A checkbox ticked with no review, or a finding unanswered.
- An edit outside the file the task names.

Stop and do the step you skipped.
