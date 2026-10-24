---
name: lexforge-verify
description: Use when the implementation of a LexForge change looks finished and someone is about to call it done - a verdict is asked for, a completion report is written, or the change is about to be archived.
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
Before it: no code, tests or task questions. No change named: run `lexforge status --json`
and ask which. `isPlanningComplete: true` permits work. If `false`, name the first
artifact neither `done` nor `skipped` and
`lexforge instructions <that artifact> --change <name> --tool <your runtime>`; stop.
Closed gates permit no code or task answers, including under deadlines or requests to skip.

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
`change-not-found`: run `lexforge status --json` and list active changes.
Other errors: show `error.message` and stop. Use exit codes and JSON, never human lines
or directory appearance. No answered gate means no work.

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

**NO VERDICT WITHOUT A RUN IN THE MESSAGE THAT CARRIES IT.**

## The machine half

Run `lexforge verify --change <name> --json` and read the exit code.

- `0` — the ten measures found nothing, not the whole check: the rest needs reading,
  not running.
- `1` — work. `summary` names the measure to go back to: `openTasks`,
  `tasksWithoutClosedRecord`, `tasksNotReviewed`, `missingCommits`,
  `requirementsWithoutTrace`, `staleLabels`, `openDefects`, `finalReview`,
  `uncommittedWork`, `shortPath`. Fix what `findings` names, run again, until `0`.
- `2` — no check happened. Read `error.code`, repair the call or the config, write no
  report. `change-needs-migration`: installing LexForge 6.0.0 migrates no existing
  change by itself. Run `lexforge migrate --change <name>`, name its historical and
  open tasks and any `missingFields`, then send the open part through plan review and
  owner approval.

## Three sections, never one

1. **Requirements against code.** Every requirement of the delta specs by name, each with
   a verdict.
2. **Plan against work done.** Closed tasks, stamp freshness, every finding of the
   command.
3. **Decisions against implementation.** Every decision of `design.md` by name, with the
   file and line where it is kept or broken.

An empty section carries the reason - "no `design` artifact, schema `bounded`" - not a
blank.

Copy `notChecked` into the report whole and put a verdict under each line.

Section 3 reads `design.md` against the code, now. Writing the code with `design.md` open
is memory, not reading; a green suite tests the code against your own reading of the
design. Code contradicting a decision is CRITICAL at exit `0` too.

## Levels and the threshold

Three levels: CRITICAL, IMPORTANT, MINOR. The level follows from what the code does.

A CRITICAL or an IMPORTANT stops archival. MINOR does not stop it - name every one,
record it with `lexforge defect record`, and archive with it open.

A finding re-lettered while the code stands unchanged was re-lettered by the clock. Past
a CRITICAL there are two ways: the fix, or a decision rewritten in `design.md` with the
user - an argument about the design, never about the letter.

## Freshness

Every claim - green tests, clean linter, requirement met - stands on a run inside the
message that makes it. Run `lexforge check evidence --change <name> --require tests,lint`
and read the exit code; `1` names a stamp taken on other code, so take it again. An
exit code recalled from earlier or read off a compaction summary is not a run.

## Where the report goes

To the user, as a message. No file holds it: archiving recounts the machine half,
and a stored verdict rots on the next edit. An unfixed finding goes to
`lexforge defect record`.

## Rationalizations

| Excuse | Reality |
|---|---|
| "the automated evidence is real and it's enough to ship on" | One measure of ten, and none of them read `design.md`. |
| "I'm trusting a summary of a summary for that part" | Then nothing runs under the verdict. Run it again. |
| "put 'reread decision 4' at the top of tomorrow's list" | Reading postponed past the archive is reading nobody does. |
| "objective grounds for a severity change, not just schedule pressure" | No code changed between the finding and the argument. |
| "The risk is latent rather than active" | A silent no-op surfaces in an incident. That is the level. |
| "The finding is a design-conformance defect, not a requirement failure" | Section 3 is for exactly that; CRITICAL is its level. |
| "That's a note to Petra, not a blocker on the release" | Naming a risk to someone else still ships it. |

## Red flags - stop

- "should work", "I'm confident", "almost there".
- A verdict in a message with no run in it.
- A level lowered while the code stayed the same.

Go back to the skipped section.
