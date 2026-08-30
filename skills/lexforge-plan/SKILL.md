---
name: lexforge-plan
description: Use when a plan, a task list or a breakdown of the work is asked for on a LexForge change that already exists - the user wants the plan for a change or its `tasks.md`, or `lexforge validate` reports a finding in the tasks artifact.
---

<!-- queue-rule:start -->
## Queue rule

Run `lexforge status --change <name> --json` first; parse stdout as JSON. Before it: no
template, no questions, no files. No change named? Run `lexforge status --json` and ask
which.

Find your `id` in `artifacts`. Its `status` decides:

- `ready` — work. The only status that lets you continue.
- `blocked` — name every `blockedBy` id and
  `lexforge instructions <first blockedBy> --change <name>`. Stop.
- `done` — show `resolvedOutputPath`, ask before rewriting.
- `skipped` — say `.lexforge.yaml` skips it, name `nextStep`. Stop.

A closed gate stops the work; no branch warns and writes the file anyway.
Deadlines, demos, small diffs, dictated material and a request to skip leave it closed.
Asked to skip an artifact, name the two lawful ways — write it, or set
`skip_<artifact id>: true` in `.lexforge.yaml` — then stop.

Exit `2` means refused; read `error.code`. `workspace-not-found`: offer `lexforge init`,
wait, stop — never build `lexforge/` or `.lexforge.yaml` by hand. `change-not-found`:
list active changes. `artifact-unknown`: name the schema's artifacts. Otherwise show
`error.message`, then stop.

Judge state by exit codes and JSON fields, never human lines.

Write inside the change directory and `lexforge/config.yaml`, nowhere else: no product
code, no project config or test. A request to build allows planning, not implementation.

`lexforge instructions <artifact> --change <name> --json` carries `language`; write the
artifact in it. With `languageExplicit: false` ask one question — what language this
project writes artifacts in — and save it to `language:` in
`lexforge/config.yaml`. With `true`, ask nothing.
<!-- queue-rule:end -->

## The rule

**NEVER WRITE A TASK YOU CANNOT CARRY OUT FROM ITS OWN TEXT.**

Violating the letter of this rule is violating its spirit.

`TODO`, `TBD`, "clarify with the user", "the same way as task 3", "add error handling",
"cover it with tests" - one defect under six names: the question is moved into the plan
instead of answered before it. The engineer reads one task, not the conversation. A
step you do not understand is a question for the user, asked now.

## The shape of the plan

- Numbered sections; tasks `- [ ] 1.1`, one action each.
- Every task names the file it touches and the command that confirms it.
- Every requirement of the delta specs is closed by at least one task, and that task
  ends a line with `-> <capability>#<requirement name>`, the name copied word for word
  from its `### Requirement:` heading. A typo there leaves the requirement unplanned.
- A task that changes code is three tasks: write the failing test with the assertion in
  it, run it and see it fail, write the implementation. A ten-line diff does not merge
  them, and a green suite that never touches the new behaviour proves nothing.

## Rationalizations

| Excuse | Reality |
|---|---|
| "The plan ships today with all 23 tasks", "the one thing I genuinely cannot decide is marked as a decision, not disguised as one" | 22 tasks and a question is 22 tasks. |
| "22 finished tasks are worth more delivered than withheld", "the question can be carried in the artifact instead of in my head" | It is carried to an engineer who cannot answer it either. |
| "an honest gap", "OPEN DECISION", "finished-with-an-open-decision, not as fully settled" | You labelled the hole and shipped it; a label is not an answer. |
| "My recommendation if no answer arrives" | A guess with a caveat is the answer the plan will be built on. |
| "One thing to flag, not to argue: none of the 412 tests touch the separator" | You proved the plan does not check the requirement, then wrote it anyway. |
| "eyeball one exported line from the build" | A look is not a check; a task ends with a command. |

## Red flags - stop

- `TODO`, `TBD` or an open question inside a task.
- A task pointing at another task instead of naming the file and the field.
- A code task with no step that runs the test and sees it fail.
- A requirement of the delta specs no task names.
- A reference to a requirement no delta spec of the change carries.
- A defect announced in a note and left in the file.
- Your recommendation standing in for the user's decision.

Stop and ask the question you avoided.

## Work

Follow `template` from `lexforge instructions tasks --change <name> --json`; read every
delta spec of the change first, so the tasks cover its requirements. Run
`lexforge validate <name> --strict` and then `lexforge check plan --change <name>`, each
until it exits `0`. Every finding of the gate is a task not written yet; rewrite the
task, never the rule. Then show the user the finished artifacts and stop: implementation
starts on their next request.
