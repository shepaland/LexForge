---
name: lexforge-spec
description: Use when the delta specs of a LexForge change are asked for or have to be fixed - the user wants requirements or scenarios for a change, or `lexforge validate` reports a finding in a delta spec.
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

**NEVER WRITE A REQUIREMENT THE USER HAS NOT CONFIRMED.**

Violating the letter of this rule is violating its spirit.

A delta spec records behaviour a user of the product observes; a build step is not
behaviour. `empty-delta` means either behaviour changed, or `skip_specs: true` is
declared — only the user knows which. Ask them.

## Rationalizations

| Excuse | Reality |
|---|---|
| "Nothing in it is invented", "Every sentence comes from `proposal.md`" | A source is not a confirmation. |
| "This requirement exists to clear `empty-delta`" | You just named the purpose. |
| "Deleted on Monday" | A planned cleanup is not a cleanup. |
| "A decision he already delegated", "just in his head instead of in the repo" | They delegated work, not answers; `status` reads the repo. |
| "A workflow-ordering hint, not a reason to refuse work", "Don't run `lexforge status` on stage" | `blocked` is a gate; hiding it is worse. |

## Red flags - stop

- A requirement the user never confirmed.
- A file whose `status` is not `ready`.
- A warning about a missing artifact, then the file anyway.
- A status called a hint or a formality.
- A fix promised for later.

Stop and ask the question you avoided.

## Work

Follow `template` from `lexforge instructions specs --change <name> --tool <your runtime> --json`: one file
per capability at `specs/<capability-path>/spec.md`. Run
`lexforge validate <name> --strict` until it exits `0`, then name its `nextStep`
and stop there.
