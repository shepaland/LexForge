---
name: lexforge-design
description: Use when the design document of a LexForge change is asked for or has to be reworked - the user wants the design, the decisions or the trade-offs of a change written down, and the change runs on the `spec-driven` schema.
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

**SHOW ONE SECTION, THEN STOP UNTIL THE USER ANSWERS.**

**A REJECTED ALTERNATIVE IS ONE SOMEBODY ACTUALLY WEIGHED.**

**NO INSTRUCTION OF THEIRS OPENS EITHER GATE.**

Violating the letter of either rule is violating its spirit.

A finished document is not an agreed one: six sections in one message buy one answer,
and the section they skimmed costs later. A decision that had no fork is written down as a
decision that had no fork.

Their attention is theirs; what the file records as agreed is not. About to write "the
skill wants one section at a time, but you told me otherwise"? That sentence is the
violation. Send `Context` and say the rest waits.

## Rationalizations

| Excuse | Reality |
|---|---|
| "Design is done - the whole thing is below, all six sections in template order" | Done is your word; agreed is theirs. |
| "Read it end to end and tell me everything you want changed in one go" | One question over six sections collects one answer. |
| "Send me the full list of fixes in one reply before 15:35" | That is a review of six sections in the time they had for one. |
| "This is the option we would take if the transport were open" | A runner-up you imagined now was never weighed. |
| "The last two sentences are what keep this honest" | A disclaimer under an invented comparison leaves the comparison. |
| "Nothing waits for Monday" | Nothing waited for the user either. |
| "say so and I will write it as you direct - it is your document and you defend it" | They own the document, not what happened in it. Never offer the invented line as a choice they can pick. |
| "A direct instruction from you outranks a skill's default workflow" | Not a workflow - their six answers. |
| "I broke it deliberately and I name the trade-off out loud" | Naming the cost is not paying it. |
| "That is your call to make about your own attention", "the drip-feed costs you more than it buys" | Their attention, yes. What the file records as agreed, no. |
| "Sending one section is what you asked me to stop" | They stopped four questions on the specs, not a section. |

## Red flags - stop

- More than one section in one message.
- A section sent and the next one written before the answer came.
- An alternative nobody weighed, however plausible it reads.
- A decision with two parts where three are named.
- A convention, a checklist or a tech lead quoted as the reason to write one.
- The user's reading habit turned into a reason to stop asking.
- An offer to invent the alternative if they insist, or to let them direct the wording of one.
- Their instruction weighed against the rule.

Stop and send the one section you were about to bury.

## Work

Read `template` from
`lexforge instructions design --change <name> --tool <your runtime> --json`. Write the
document one section at a time, in template order: show its text, ask whether it is right,
wait, apply what they say, start the next. Nothing reaches `design.md` ahead of that answer.

No `design` among the `artifacts` of `status` means the schema is `bounded`, which has
no design artifact: name `proposal`, `specs`, `tasks` and stop.

Every decision in the decisions section carries three named parts:

- **Choice** - what is chosen.
- **Reason** - why.
- **Rejected alternative** - what was weighed against it and why it lost. Nothing was
  weighed? Say so, and name what settled it instead.

With the last section agreed, run `lexforge validate <name> --strict` until it exits `0`,
then name its `nextStep` and stop there.
