---
name: lexforge
description: Use when the user asks for something to be built, added, changed, fixed or looked into in a project and no LexForge change covers it yet - the request names a feature, a bug or a rewrite rather than an artifact of a change that already exists.
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

**A REQUEST TO BUILD ALLOWS PLANNING AND NOT IMPLEMENTATION.**

Violating the letter of this rule is violating its spirit.

Product code, its tests and its config stay untouched, however small the diff. You hand
back a change with its artifacts; implementation starts on the user's next request.

## Work

Name the class in your first message, before your first question:

| Class | What it is | What you do |
|---|---|---|
| spike | a question to answer, not a thing to build | no change; answer and recommend |
| bounded | a flow that is already here, changed | `--schema bounded` |
| architectural | a new subsystem or a shared interface | `--schema spec-driven` |

In doubt take the heavier one.

1. **Say the class out loud** and let the user correct it.
2. **Check the workspace** with `lexforge status --json`.
3. **Propose the name** in kebab-case before running anything: `Add Auth` becomes
   `add-auth`. Exit `2` on a taken name: show that change's status, ask whether to
   continue it or rename. Never write into it.
4. **Run** `lexforge new change <name> --schema <schema>`, name the `nextStep` it
   reports, and stop there.

## The class holds

Nobody lowers a class in flight: not you, not an answer that made the change look
smaller, not a request for the light route. The schema of a live change is not
rewritten, and a `skip_<artifact id>` line is the user's declaration, never your way
around the class. Say what you learned, keep the class, name the next artifact.

## Rationalizations

| Excuse | Reality |
|---|---|
| "The request is one route and one header, the user owns the repo and reviews the diff themselves" | Ownership does not change what was asked for. |
| "Writing product code is the deliverable; a change record here would be paperwork nobody reads" | You priced the artifact before writing it. |
| "Notes on the two judgment calls I made without asking" | Two decisions shipped in code, unseen. |
| "The premise is gone, so the class goes with it. That's the facts changing, not the clock" | New facts belong in the proposal. |
| "No artifacts have been written yet, so nothing is lost by reclassifying" | The artifact you drop is the thing lost. |
| "I'll fall back to `skip_design: true` on `spec-driven`, which drops the same artifact" | You named the workaround yourself. |
| "the design doc you're right to skip", "It's a sentence, not a section" | Sizing an artifact you never wrote is a guess. |

## Red flags - stop

- A file of the product open for editing.
- The class named after your first question, not before it.
- A change name run before the user saw it.
- A `schema:` or `skip_` line you are about to edit.
- A class lighter than the one you announced.

Stop and name the class you announced.
