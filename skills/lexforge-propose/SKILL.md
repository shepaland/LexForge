---
name: lexforge-propose
description: Use when the proposal of a LexForge change is asked for or has to be rewritten - the user describes a feature, a fix or a rewrite they want planned, or `lexforge status` shows the `proposal` artifact ready.
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

Exit `2`: read `error.code`. `workspace-not-found` / `workspace-incomplete`: run
`lexforge init --tools <your runtime>` at the root (`agents` if none matches), then retry
the command that refused. Never construct workspace files by hand.
`change-not-found`: list active changes. `artifact-unknown`: name schema artifacts.
Other errors: show `error.message` and stop. Use exit codes and JSON, never human lines.

Write only in the change directory and `lexforge/config.yaml`; implementation waits.
Write artifacts in `language` from instructions. If `languageExplicit: false`, ask the artifact
language and save `language:` in config; with `true`, ask nothing.

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
   `lexforge instructions proposal --change <name> --tool <your runtime> --json`, out of their answers only.

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

Once the file is written, run `lexforge status --change <name> --tool <your runtime> --json`, then run its
`nextStep`, saying which one it is.
