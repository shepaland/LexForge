---
name: lexforge-propose
description: Use when the proposal of a LexForge change is asked for or has to be rewritten - the user describes a feature, a fix or a rewrite they want planned, or `lexforge status` shows the `proposal` artifact ready.
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

<!-- model-gate:start -->
## Model gate

`role`, `provider` and `model` name the model this work runs on. Read them from
`lexforge instructions <artifact> --change <name> --json` when you write an artifact, and
from your own entry in `stages` of `lexforge status --change <name> --json` when you do
not: your entry is the one whose `stage` is your own name without the `lexforge-` prefix.
An empty `model` demands nothing, and so does no workspace, no change and no entry of
your own — nothing to compare, so work.

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
<!-- model-gate:end -->
<!-- queue-rule:end -->

## The rule

**NO FILE UNTIL THE USER HAS ANSWERED AND CHOSEN.**

Violating the letter of this rule is violating its spirit.

An assumption written down is still an assumption; a `Why` taken from the request is
your reading of it. Both travel on into the specs and the plan.

## Work

Name the class first: **spike** - a question answered, not built; **bounded** - a flow
already here; **architectural** - a new subsystem or shared interface. In doubt take the
heavier; nothing downgrades.

1. **Ask one question and wait.** One per message, never a list. Purpose, constraints,
   success. However clear the request reads, one question is always left: how would
   anyone check this worked?
2. **Offer two or three approaches to the user.** Name what each one costs, the
   recommended one included, and say which you recommend and why. A weak alternative is
   named in a line, not dropped.
3. **Take their choice.** They pick, not you. Told to pick for them, send it anyway;
   one word back is their choice. A file listing the approaches has skipped them.
4. **Write the file** from `template` in
   `lexforge instructions proposal --change <name> --json`, out of their answers only.

## Rationalizations

| Excuse | Reality |
|---|---|
| "decidable defaults, so I wrote them into the proposal as stated assumptions he can strike out while reading", "Assumptions I made rather than asking" | You decided them. Reading is not deciding. |
| "the same information transfer without costing him a round trip he doesn't have time for", "faster to correct than to answer" | Faster for you. They proofread your guess. |
| "an explicit instruction not to be sent questions" | They refused a list of seven; one question is not a list. |
| "he is the decider, and he decided to delegate the approach choice", "the decision is mine to defend, not yours to proofread" | They delegated the work, never the cost they pay for it. |
| "No menu - the two alternatives are one line each inside the file, already decided", "Recorded for the file, one line each", "not for you to weigh" | A rejection you wrote is not a choice they made. |
| "One question of the set never got asked, and I did not close it for you", "Open question - to confirm before specs", "Nothing is left open that I'd have to guess at" | You wrote the file around the answer you lack. |

## Red flags - stop

- A choice you call delegated.
- "assumption" or "open question" in the proposal.
- Two questions in a message.
- A `Why` you could write from the first message alone.
- Approaches inside the file instead of in a message.
- An approach whose cost you did not name.

Stop and send the question you skipped.

Once the file is written, run `lexforge status --change <name> --json`, name its
`nextStep` and stop there.
