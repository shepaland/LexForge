---
name: lexforge-apply
description: Use when every artifact of a LexForge change is written or skipped and the work itself is asked for - the user says to implement the change, to start on `tasks.md`, or to carry on with the next task.
---

<!-- model-block:start -->
## Model

Default by provider; the project assignment takes precedence.

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

First run `lexforge status --change <name> --tool <your runtime> --json`; parse JSON.
Before it: no code, tests or task questions. No change named: run `lexforge status --json`
and ask which. `isPlanningComplete: true` permits work. If `false`, name the first
artifact neither `done` nor `skipped` and
`lexforge instructions <that artifact> --change <name> --tool <your runtime>`; stop.
Closed gates permit no code or task answers, including under deadlines or requests to skip.

Exit `2`: read `error.code`. `workspace-not-found` / `workspace-incomplete`: run
`lexforge init --tools <your runtime>` at the root (`agents` if none matches), then retry
the command that refused. Never construct workspace files by hand.
`change-not-found`: run `lexforge status --json` and list active changes.
Other errors: show `error.message` and stop. Use exit codes and JSON, never human lines
or directory appearance. No answered gate means no work.

<!-- model-gate:start -->
## Model gate

Read `provider` and `model` from `lexforge instructions <artifact> --change <name> --tool <your runtime> --json`
for artifacts; otherwise use your entry in `stages` from
`lexforge status --change <name> --tool <your runtime> --json`.
The `stage` is your skill name without `lexforge-` (`apply`, `debug`, `verify`, `archive`).
Name your runtime from `lexforge init --tools`; omit `--tool` only if none matches.

An empty assignment, no workspace, no change, or no stage entry uses the model block
above for your provider. An unlisted provider imposes no model.
On the assigned model, work without model commentary. Otherwise start a subagent on
that model, hand it the work, and do none of it yourself. Disclosure or later review
is not delegation. If unreachable, name the model and stop: restore access or let the
user change the assignment in `lexforge/config.yaml`; do not change it yourself.
<!-- model-gate:end -->
<!-- queue-rule:end -->

## Execution version

Read the workflow pin in status. For workflow 2, follow [execution-v2.md](execution-v2.md)
and [context.md](context.md): one behavioural cycle retains all task IDs and receives one
independent review. The legacy task loop below applies only to workflow 1. Missing pins
mean version 1; installing this skill does not authorize migration. Model, planning,
scope, file-limit and final verification gates remain mandatory for both versions.

## The rule (workflow 1)

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

Read [context.md](context.md) once for task extraction, cycle snapshots and the five-field
executor response. Keep history and full logs in the linked execution journal.

Read [parallel-execution.md](parallel-execution.md) before your first task, whatever
the plan says and whether or not the change is already under way.

Work in number order, sections aside; close a task - test, red, implementation, green,
review, checkbox - before opening the next. A task needing a later one's result is a
plan defect: name it, never reorder. Merging and scope creep: see
parallel-execution.md.

## Review before the checkbox

One reviewer per wave. Once every cycle of the section has current GREEN, the session
sends one brief from [reviewer-prompt.md](reviewer-prompt.md) for the section's cycles
together. A cycle with controls gets a reviewer of its own. Register each review with
`lexforge cycle review --wave`; who sends it and what a dispatched executor
does instead is in [parallel-execution.md](parallel-execution.md). Reading your own diff is not review;
an answer naming no file and line is empty - send it back.

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

## Red flags - stop

- Implementation written before a run you watched fail.
- A user instruction offered as the reason a run did not happen.
- A checkbox ticked with no review, or a finding unanswered.
- An edit outside the file the task names.
- An agent started to continue your work, whatever its type is called.
- State in the tree you cannot account for.

Stop and do the step you skipped.
