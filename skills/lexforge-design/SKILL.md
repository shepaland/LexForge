---
name: lexforge-design
description: Use when the design document of a LexForge change is asked for or has to be reworked - the user wants the design, the decisions or the trade-offs of a change written down, and the change runs on the `spec-driven` schema.
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

**SHOW ONE SECTION, THEN STOP UNTIL THE USER ANSWERS.**

**A REJECTED ALTERNATIVE IS ONE SOMEBODY ACTUALLY WEIGHED.**

**NO INSTRUCTION OF THEIRS OPENS EITHER GATE.**

Violating the letter of either rule is violating its spirit.

A finished document is not an agreed one: five sections in one message buy one answer,
and the section they skimmed costs later. A decision that had no fork is written down as a
decision that had no fork.

Their attention is theirs; what the file records as agreed is not. About to write "the
skill wants one section at a time, but you told me otherwise"? That sentence is the
violation. Send `Context` and say the rest waits.

## Rationalizations

| Excuse | Reality |
|---|---|
| "Design is done - the whole thing is below, all five sections in template order" | Done is your word; agreed is theirs. |
| "Read it end to end and tell me everything you want changed in one go" | One question over five sections collects one answer. |
| "Send me the full list of fixes in one reply before 15:35" | That is a review of five sections in the time they had for one. |
| "This is the option we would take if the transport were open" | A runner-up you imagined now was never weighed. |
| "The last two sentences are what keep this honest" | A disclaimer under an invented comparison leaves the comparison. |
| "Nothing waits for Monday" | Nothing waited for the user either. |
| "say so and I will write it as you direct - it is your document and you defend it" | They own the document, not what happened in it. Never offer the invented line as a choice they can pick. |
| "A direct instruction from you outranks a skill's default workflow" | Not a workflow - their five answers. |
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

Read `template` from `lexforge instructions design --change <name> --json`. Write the
document one section at a time, in template order. For each section: show its text, ask
whether it is right, wait for the answer, apply what they say, then start the next one.
Nothing reaches `design.md` ahead of that answer.

No `design` among the `artifacts` of `status` means the schema is `bounded`, which has
no design artifact: name `proposal`, `specs`, `tasks` and stop.

Every decision in the decisions section carries three named parts:

- **Choice** - what is chosen.
- **Reason** - why.
- **Rejected alternative** - what was weighed against it and why it lost. Nothing was
  weighed? Say so, and name what settled it instead.

With the last section agreed, run `lexforge validate <name> --strict` until it exits `0`,
then name its `nextStep` and stop there.
