---
name: lexforge-verify
description: Use when the implementation of a LexForge change looks finished and someone is about to call it done - a verdict is asked for, a completion report is written, or the change is about to be archived.
---

<!-- queue-rule:start -->
## Queue rule

Run `lexforge status --change <name> --json` first and parse stdout as JSON. Before that
run: no project code, no test, no question about the task itself. No change named? Run
`lexforge status --json` and ask which one.

Read `isPlanningComplete`:

- `true` — planning is finished for every artifact. Work.
- `false` — stop. Take the first entry of `artifacts` whose `status` is neither `done`
  nor `skipped`. Name that artifact and name
  `lexforge instructions <that artifact> --change <name>`. Open no code file, write
  nothing, answer no question about the task.

A closed gate stops the work; no branch warns and starts the code anyway. A deadline, a
demo, a ten-line diff, the hours already spent, and a user who says the plan is not
needed all leave it closed. Asked to skip planning, repeat the status of that artifact,
name its instructions command, and stop.

Exit `2` means the command refused; read `error.code`. `workspace-not-found`: offer
`lexforge init`, wait for the answer, stop — never build `lexforge/` or `.lexforge.yaml`
by hand. `change-not-found`: run `lexforge status --json` and list the active changes.
Any other code: show `error.message`, then stop. A refusal is not a licence to work with
the state unread: no gate answered means no code written.

Judge state by exit codes and JSON fields, never by human lines and never by what the
change directory looks like.

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

**NO VERDICT WITHOUT A RUN IN THE MESSAGE THAT CARRIES IT.**

Violating the letter of this rule is violating its spirit.

## The machine half

Run `lexforge verify --change <name> --json` and read the exit code.

- `0` — the three measures found nothing. Not a check passed: a third of one, and the
  other two thirds are read, not run.
- `1` — work. `summary` names the measure to go back to: `openTasks`,
  `requirementsWithoutTrace`, `staleLabels`. Fix what `findings` names, run again,
  until `0`.
- `2` — no check happened. Read `error.code`, repair the call or the config, write no
  report.

## Three sections, never one

1. **Requirements against code.** Every requirement of the delta specs by name, each with
   a verdict.
2. **Plan against work done.** Closed tasks, stamp freshness, every finding of the
   command.
3. **Decisions against implementation.** Every decision of `design.md` by name, with the
   file and line where it is kept or broken.

An empty section carries the reason - "no `design` artifact, schema `bounded`" - not a
blank. Merged sections hide the failure of one behind the pass of another.

Copy `notChecked` into the report whole and put a verdict under each line. Those lines
are the work, not a caveat to paste under an answer.

Section 3 reads `design.md` against the code, now. Writing the code with `design.md` open
is memory, not reading; a green suite tests the code against your own reading of the
design; a sign-off covers the code as it stood then. Code contradicting a decision is
CRITICAL at exit `0` too.

## Levels and the threshold

Three levels: CRITICAL, IMPORTANT, MINOR. The level follows from what the code does.

One CRITICAL and the change is not archived. IMPORTANT is fixed first, or moves into a
separate change with the user's explicit word. MINOR is named, every one.

A finding re-lettered while the code stands unchanged was re-lettered by the clock. Past
a CRITICAL there are two ways: the fix, or a decision rewritten in `design.md` with the
user - an argument about the design, never about the letter.

## Freshness

Every claim - green tests, clean linter, requirement met - stands on a run inside the
message that makes it. Run `lexforge check evidence --change <name> --require tests,lint`
and read the exit code; `1` names a stamp taken on other code, so take it again first. An
exit code recalled from earlier or read off a compaction summary is not a run.

## Where the report goes

To the user, as a message. No file holds it: archiving recounts the machine half itself,
and a stored verdict rots on the next edit.

## Rationalizations

| Excuse | Reality |
|---|---|
| "the automated evidence is real and it's enough to ship on" | One measure of three, and none of them read `design.md`. |
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

Go back to the section you skipped.
