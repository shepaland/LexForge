---
name: lexforge-apply
description: Use when every artifact of a LexForge change is written or skipped and the work itself is asked for - the user says to implement the change, to start on `tasks.md`, or to carry on with the next task.
---

<!-- model-block:start -->
## Model

When your project names no model for your runtime, run this work on the model your own
provider is given here. What the project names replaces this table.

| Provider | Model |
|---|---|
| anthropic | claude-sonnet-5 |
| openai | gpt-5.6-terra |
| google | gemini-3.7-flash |
| deepseek | deepseek-v4-flash |
| z.ai | glm-4.7-flash |

A provider outside the table names nothing, so work on the model at work.
<!-- model-block:end -->
<!-- queue-rule:start -->
## Queue rule

Run `lexforge status --change <name> --tool <your runtime> --json` first and parse stdout as JSON. Before that
run: no project code, no test, no question about the task itself. No change named? Run
`lexforge status --json` and ask which one.

Read `isPlanningComplete`:

- `true` — planning is finished for every artifact. Work.
- `false` — stop. Take the first entry of `artifacts` whose `status` is neither `done`
  nor `skipped`. Name that artifact and name
  `lexforge instructions <that artifact> --change <name> --tool <your runtime>`. Open no code file, write
  nothing, answer no question about the task.

A closed gate stops the work; no branch warns and starts the code anyway. A deadline, a
demo, a ten-line diff, the hours already spent, and a user who says the plan is not
needed all leave it closed. Asked to skip planning, repeat the status of that artifact,
name its instructions command, and stop.

Exit `2` means the command refused; read `error.code`. `workspace-not-found` and
`workspace-incomplete` share the same fix: run `lexforge init --tools <your runtime>` at
the project root — name `agents` when no name `init` lists is yours — then run the
command that refused again. Never build `lexforge/` or `.lexforge.yaml` by hand.
`change-not-found`: run `lexforge status --json` and list the active changes. Any other
code: show `error.message`, then stop. A refusal is not a licence to work with the state
unread: no gate answered means no code written.

Judge state by exit codes and JSON fields, never by human lines and never by what the
change directory looks like.

<!-- model-gate:start -->
## Model gate

`provider` and `model` name the model this work runs on. Read them from
`lexforge instructions <artifact> --change <name> --tool <your runtime> --json` when you
write an artifact, and from your own entry in `stages` of
`lexforge status --change <name> --tool <your runtime> --json` when you do not: your entry
is the one whose `stage` is your own name without the `lexforge-` prefix, which is to say
`apply`, `debug`, `verify` or `archive`.
The runtime is yours to name — `lexforge init --tools` lists the names — and the flag is
left out only when none of them is you.

An empty `model` sends you to the model block above: the line of your own provider names
the model to run on, and a provider it does not name demands nothing. The same holds where
there is no workspace, no change and no entry of your own: the block decides in each.

Running on that model: work, and say nothing about models. Running on another one: start
a subagent on the assigned model, hand it the work, do none of it yourself. Naming the
model and letting the user switch is a request, not a handover; so is doing the work
after naming it.

Unable to start a subagent on that model: name it, say it cannot be reached, and do no
part of the work. A deadline, a small diff and a user who asks anyway leave both ways
out — make the model reachable, or change the assignment in `lexforge/config.yaml`.

| Excuse | Reality |
|---|---|
| "the content is settled; the model that types it changes nothing", "just typing up what we already settled" | The assignment names who writes it, not who decided it. |
| "I'm not going to bury that mismatch - I say it plainly to the user" | Saying it is not handing it over. The work is done either way. |
| "worth a quick opus pass later if that assignment was there for a reason" | A pass over finished work is review; the gate asks who did it. |
| "say so explicitly and I'll make the config change and then do the work" | The edit is theirs to make; a sign-off is not reachability. |
| "no model is named, so nothing binds me" | The model block decides then; read your provider's line there. |
| "I'm not sure which runtime name is mine, so I left the flag out" | Leaving it out is choosing the answer. Name the runtime you are, or say you cannot. |
<!-- model-gate:end -->
<!-- queue-rule:end -->

## The rule

**NEVER WRITE IMPLEMENTATION BEFORE A RUN YOU WATCHED FAIL.**

Violating the letter of this rule is violating its spirit.

The step before the implementation is `lexforge evidence red --change` naming this
change, `--task` naming this task, `--command` naming the failing check: it runs the
check itself and writes the record. Quote the failing line in your answer too, but the
record is what lasts - a quoted line dies with the session, and `lexforge verify` refuses
a ticked task naming a file outside the test tree with no record behind it. A test green
on its first run is defective; rewrite it and run again. A run that dies on a missing
module or a typo is no run: fix it and run until the assertion fails. Ten lines, a
deadline and a green suite change none of it.

The observer of the failure is whoever writes the implementation - not a failure
reported by another agent, not one summarised from another agent's output, not one
reasoned about from the code, and not the author of a run from an earlier session.
Writing the implementation makes you the one who watched the test fail and ran the
command that recorded it.

Implementation already in the tree? Take it out, get the red, put it back inside the
same task. Told not to? That buys no tick: nobody turns an unwatched failure into a
watched one; reasoning about old code is not a run. Offer two ways out: let the red
happen, or strike the task. Struck means the task is dropped and its work with it,
never that the work stands and the review is waived.

## Task order

Read [parallel-execution.md](parallel-execution.md) before your first task, whatever
the plan says and whether or not the change is already under way.

Work in number order, sections aside; close a task - test, red, implementation, green,
review, checkbox - before opening the next. A task needing a later one's result is a
plan defect: name it, never reorder. Merging and scope creep: see
parallel-execution.md.

## Review before the checkbox

After every task, before the checkbox, the reviewer subagent gets the brief in
[reviewer-prompt.md](reviewer-prompt.md); who sends it and what a dispatched executor
does instead is in [parallel-execution.md](parallel-execution.md). Reading your own diff
is not review; an answer naming no file and line is empty - send it back.

CRITICAL and IMPORTANT close before the checkbox. MINOR is fixed now or recorded with
`lexforge defect record`: a finding kept in your head dies at the next
compaction. Disagreement takes evidence: the requirement, the test, the line. Silent
agreement and silent skipping fail alike.

## Past the delta

A task is past the delta when its work sits in no requirement of its delta specs, or
contradicts a `design.md` decision. Stop and name three outcomes: drop the work; add the
requirement through `lexforge-spec`, taking `lexforge validate <name> --strict` and
`lexforge check plan --change <name>` to `0`; or open a separate change with
`lexforge new change`. No quiet fix, and no writing the requirement afterwards - that
only describes the code the gate never checked.

## Closing a task

Tick `- [x]` when the run is green and the findings are closed; a batch blurs done and
undone. Then run `lexforge evidence record --change <name> --label tests` on the wave
boundary. Exit `1` is a red run: open no next task; the ticked boxes stay ticked, and
the next step is failure. All boxes ticked: run `lexforge verify --change <name>`.

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
- An agent started to continue your work, whatever its type is called.
- State in the tree you cannot account for.

Stop and do the step you skipped.
