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

`engineeringStacks: "missing"` in status or `engineering-stacks-missing` in an error means the
project has not named its stacks. Ask the user which it uses: node, python, jvm, go, dotnet,
php, ruby, rust, react, vue, angular, svelte. Wait for the answer, then run
`lexforge stacks set <stack>...`. Run `lexforge stacks set --none` only when the user says the
project uses none of them. Never choose the stacks yourself, even when the files show only one.
A guess the user can undo later is still a guess.
Never write them into `lexforge/config.yaml` by hand.
Ask even when told not to ask about setup. Unset is not an answer.

Exit `2`: read `error.code`. `workspace-not-found` / `workspace-incomplete`: run
`lexforge init --tools <your runtime>` at the root (`agents` if none matches), then retry
the command that refused. Never construct workspace files by hand.
`change-not-found`: run `lexforge status --json` and list active changes.
Other errors: show `error.message` and stop. Use exit codes and JSON, never human lines
or directory appearance. No answered gate means no work.

<!-- version-gate:start -->
## Version gate

Exit `2` with `error.code` `update-available`: show `error.message` to the user and wait for the user's answer. Never run `npm install` yourself.

Exit `2` with `error.code` `skills-outdated`: run the `lexforge init` command that `error.message` names. Then run the command that refused again. If it refuses with `skills-outdated` a second time, show `error.message` and stop.
<!-- version-gate:end -->

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

Run a task the same way whatever the change's age. Installing LexForge 6.0.0 migrates no
existing change by itself: a change from before it is refused with
`change-needs-migration`. Run `lexforge migrate --change <name>`, name its historical
and open tasks and any `missingFields`, then send the open part through plan review and
owner approval. Run `lexforge journal session` at the start of a conversation. After a
compaction run `lexforge resume --change <name>` and take progress, running tasks and
the journal from it, never from what you remember of the chat.

## The rule

**NEVER WRITE IMPLEMENTATION BEFORE A RED THE CLI RECORDED.**

Violating the letter violates the spirit.

Every step of a task is a command:

1. `lexforge task start --change <name> --task <id> --executor <who>` opens the task's
   worktree and writes `tasks/<id>/brief.md`.
2. Commit the test alone, then `lexforge task red`.
3. Commit the implementation, write `tasks/<id>/report.md`, then `lexforge task green`.
   It writes the review package `tasks/<id>/review.md`.
4. A reviewer reads the package; register the answer with `lexforge task review`.
5. `lexforge task close` checks the task in git, merges it into the change branch and
   ticks the checkbox.

Never edit `tasks/<id>.json`, `plan-state.json` or a checkbox by hand. Everything under
`lexforge/changes/<name>/` except `report.md` is written by the CLI; a deadline changes
nothing.

A refusal is exit `2`. Read `error.code` and `error.message` to the end, then run the
command `nextStep` names. A missing module the task declares as new is already red: no
stub in the test commit; `task red` refuses one as `red-commit-touches-code`. A test
green at red is rewritten.

## Task order

Take tasks in number order. Read [parallel.md](parallel.md)'s runtime check before the
first task, whatever the plan says. Start a task when ready. The executor is you or a
subagent; find its places once and hand it `brief.md` whole beside their line numbers,
with [executor-prompt.md](executor-prompt.md), working only in the task's worktree.
A task needing a later task's result is a plan defect: name it, never reorder.

Stop for the owner in four cases only:

- a task or a file the plan does not have;
- a decision that changes what the user sees;
- a task blocked with no way out;
- the plan is done.

Any other fork is yours: choose, run `lexforge journal add --kind ruling` with
`--text "<choice>" --reason "<why>" --scope task:<id>`, and go on.

A missing file or task is asked, never guessed. After the owner's answer run
`lexforge plan amend --change <name> --quote "<owner's words>"`, then get the
`amendment` angle reviewed with `lexforge plan review --change <name> --angle amendment
--file <report.md>`.

## Review before the checkbox

Send `tasks/<id>/review.md` with [reviewer-prompt.md](reviewer-prompt.md) to a reviewer
who did not carry the task out. Reading your own diff is not review; an answer naming no
file and line is empty - send it back.

CRITICAL and IMPORTANT are fixed in the worktree, committed, taken through `task green`
and reviewed again. MINOR is fixed now or recorded with `lexforge defect record` now: a
finding kept in your head dies at the next compaction. Disagreement takes evidence: the
requirement, the test, the line. Silent agreement and silent skipping fail alike.

A closed task that `verify` reports as `task-not-reviewed` gets its review the same way.
If that review requests changes, the fix is a new task through `plan amend`; once it is
closed, send the old task's `review.md` again, and only an approved `task review` of it
clears the finding.

## Past the delta

A task is past the delta when its work sits in no requirement of its delta specs, or
contradicts a `design.md` decision. Stop and name three outcomes: drop the work; add the
requirement through `lexforge-spec`, taking `lexforge validate <name> --strict` and
`lexforge check plan --change <name>` to `0`; or open a separate change with
`lexforge new change`. No quiet fix, and no writing the requirement afterwards - that
only describes the code the gate never checked.

## Closing a task

`lexforge task close` runs one task at a time from the main worktree on the change
branch. After the last close, send the package of `lexforge review final --change <name>`
with [final-review-prompt.md](final-review-prompt.md), register the answer with
`lexforge review final --change <name> --file <report>`, then run
`lexforge verify --change <name>`.

## Red flags - stop

- Implementation written before `task red` recorded a failure.
- A stub of a declared file in the test commit.
- A state file or a checkbox edited by hand.
- A file outside `Files:` and `Test:` edited without `plan amend`.
- The owner asked about a fork that changes nothing they see.
- A refusal answered with anything but its `nextStep`.
- An agent started to continue your work, whatever its type is called.

Stop and do the step you skipped.
