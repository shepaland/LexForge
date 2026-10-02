---
name: lexforge-design
description: Use when the design document of a LexForge change is asked for or has to be reworked - the user wants the design, the decisions or the trade-offs of a change written down, and the change runs on the `spec-driven` schema.
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
then run its `nextStep`, saying which one it is.
