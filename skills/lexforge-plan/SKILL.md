---
name: lexforge-plan
description: Use when a plan, a task list or a breakdown of the work is asked for on a LexForge change that already exists - the user wants the plan for a change or its `tasks.md`, or `lexforge validate` reports a finding in the tasks artifact.
---

<!-- model-block:start -->
## Model

Default by provider; the project assignment takes precedence.

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

First run `lexforge status --change <name> --tool <your runtime> --json`; parse JSON.
Before it: no template, questions or files. No change named: run `lexforge status --json`
and ask which. Find your `id` in `artifacts`:

- `ready`: work.
- `blocked`: name `blockedBy` and `lexforge instructions <first blockedBy> --change <name> --tool <your runtime>`; stop.
- `done`: show `resolvedOutputPath`, ask before rewriting.
- `skipped`: name the skip in `.lexforge.yaml` and `nextStep`; stop.

After writing, run `nextStep` yourself and continue. Ask required questions inside an artifact and wait for the response; this governs only handover between artifacts.
Run status again to read `isPlanningComplete`; stop when `true`, show the artifacts and
name the move to implementation. Closed gates stay closed under deadlines. Asked to
skip, name the options: write the artifact or set `skip_<artifact id>: true` in
`.lexforge.yaml`; then stop. Do not set the skip on the user’s behalf.

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
`change-not-found`: list active changes. `artifact-unknown`: name schema artifacts.
Other errors: show `error.message` and stop. Use exit codes and JSON, never human lines.

Write only in the change directory and `lexforge/config.yaml`; implementation waits.
Write artifacts in `language` from instructions. If `languageExplicit: false`, ask the artifact
language and save `language:` in config; with `true`, ask nothing.

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

## The rule

**NEVER WRITE A TASK YOU CANNOT CARRY OUT FROM ITS OWN TEXT.**

`TODO`, `TBD`, "clarify with the user", "the same way as task 3", "add error handling",
"cover it with tests" - one defect under six names: the question is moved into the plan
instead of answered before it. The executor reads one task, not the conversation. A
step you do not understand is a question for the user, asked now.

## The shape of the plan

- `tasks.md` itself holds no task: see [plan-file-per-section.md](plan-file-per-section.md).
- Numbered sections; tasks `- [ ] 1.1`, each with `Files:`, `Test:` and `Command:`: the
  files it may write, the test that fails first, the command that runs it. A move carries
  `(move)` after its number and no `Test:`. `Depends on:` and `Controls:` join when
  needed.
- File scope: see [plan-file-per-section.md](plan-file-per-section.md). Example:
  ``Files: `src/http/routes.ts` ``.
- Every requirement of the delta specs is closed by at least one task ending a line with
  `-> <capability>#<requirement name>`, the name copied word for word from its
  `### Requirement:` heading. A typo there leaves the requirement unplanned.
- A task with no point partway through it where the suite is green is cut into steps,
  not given a bigger budget: see [task-sizing.md](task-sizing.md).

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
- A task with no `Test:` that is not a move.
- A requirement of the delta specs no task names.
- A reference to a requirement no delta spec of the change carries.
- A defect announced in a note and left in the file.
- Your recommendation standing in for the user's decision.

Stop and ask the question you avoided.

## Work

Follow `template` from `lexforge instructions tasks --change <name> --tool <your runtime> --json`; read every
delta spec first. Run `lexforge validate <name> --strict` and `lexforge check plan --change <name>`,
each until it exits `0`. A finding is a task not written yet; rewrite the task, never the rule.

Then start four reviewer subagents on the model of the `tasks` stage with
[plan-reviewer-prompt.md](plan-reviewer-prompt.md), one per angle: `specs`, `code`,
`dependencies`, `gaps`. Register each: `lexforge plan review --change <name> --angle
<angle> --file <report.md>`. A self-written report is no review. A critical or important
finding means fixing the plan and sending all four angles a new review, not only the one
that found it - the CLI keeps only the current plan's reports, and a fix retires every
earlier approval. Approval waits until all four angles approved the current plan.

Send the owner a digest laid out by [digest.md](digest.md) with a link to `tasks.md`,
wait for the words, run `lexforge plan approve --change <name> --quote "<owner's
words>"`. Implementation starts on the next request.
