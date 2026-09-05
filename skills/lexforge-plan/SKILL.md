---
name: lexforge-plan
description: Use when a plan, a task list or a breakdown of the work is asked for on a LexForge change that already exists - the user wants the plan for a change or its `tasks.md`, or `lexforge validate` reports a finding in the tasks artifact.
---

<!-- model-block:start -->
## Model

When your project names no model for your runtime, run this work on the model your own
provider is given here. What the project names replaces this table.

| Provider | Model |
|---|---|
| anthropic | claude-opus-5 |
| openai | gpt-5.6-sol |
| google | gemini-3.1-pro-preview |
| deepseek | deepseek-v4-pro |
| z.ai | glm-4.7 |

A provider outside the table names nothing, so work on the model at work.
<!-- model-block:end -->
<!-- queue-rule:start -->
## Queue rule

Run `lexforge status --change <name> --tool <your runtime> --json` first; parse stdout as JSON. Before it: no
template, no questions, no files. No change named? Run `lexforge status --json` and ask
which.

Find your `id` in `artifacts`. Its `status` decides:

- `ready` — work. The only status that lets you continue.
- `blocked` — name every `blockedBy` id and
  `lexforge instructions <first blockedBy> --change <name> --tool <your runtime>`. Stop.
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

`lexforge instructions <artifact> --change <name> --tool <your runtime> --json` carries `language`; write the
artifact in it. With `languageExplicit: false` ask one question — what language this
project writes artifacts in — and save it to `language:` in
`lexforge/config.yaml`. With `true`, ask nothing.

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

Follow `template` from `lexforge instructions tasks --change <name> --tool <your runtime> --json`; read every
delta spec of the change first, so the tasks cover its requirements. Run
`lexforge validate <name> --strict` and then `lexforge check plan --change <name>`, each
until it exits `0`. Every finding of the gate is a task not written yet; rewrite the
task, never the rule. Then show the user the finished artifacts and stop: implementation
starts on their next request.
