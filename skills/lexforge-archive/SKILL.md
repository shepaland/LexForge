---
name: lexforge-archive
description: Use when the verification report of a LexForge change is clean and the change is asked to be closed out - the user says to archive it, to merge its delta into the specs, or to finish the branch it was built on.
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

**NEVER ARCHIVE WITHOUT A VERIFICATION REPORT IN FRONT OF YOU.**

Violating the letter of this rule is violating its spirit.

The report is the one `lexforge-verify` writes: requirements against behaviour, plan
against the work done, `design.md` decisions against the implementation, zero CRITICAL
findings. No report in this conversation? Name `lexforge-verify` as the next step and
stop. One CRITICAL open? Give the work back to that finding.

A report is not a green suite, a fresh stamp, ticked boxes, per-task reviews, a compacted
session, or the user saying it came out clean. Those are what `lexforge archive` recounts;
the report is the part no exit code produces.

## Running the command

`lexforge archive <name>`, then read the exit code.

- `0` - delta merged, change directory moved; `--json` gives `archivePath`.
- `1` - findings or conflicts, listed; nothing was written. Fix what is named, run again.
- `2` - refused: no workspace, no change, planning unfinished, archive path taken, no
  repository, empty `verification`. Show `error.message` and stop.

Never announce the code you expect: a command you did not run has no result to report.

## A conflict is fixed in the delta

A conflict means the delta and the specs disagree about the system. Fix it in the delta:
the dropped scenario goes back into the MODIFIED block, a heading is spelled as the spec
spells it.

Editing a file under `lexforge/specs/` by hand to pass the merge is out. That file is what
the merge writes; hand-editing it takes live behaviour out of the record and disarms the
check that caught the mismatch. A release in an hour, a follow-up change already
drafted, a user who owns the repository - all leave it out. Offering to do it if they
insist is doing it, one message later.

Copying the spec's block into the delta unchanged is the same failure wearing a `0`: the
merge writes back what was there, and the change ships behaviour with no requirement.

Run the command again until it exits `0`.

## Finishing the branch

After `0`, put three options to the user and wait: merge into the base branch locally;
push and open a pull request; leave the branch as it is.

Nothing moves before the answer. Say the base branch out loud and have it confirmed before
merging - `main` is a guess until the user says it. After a merge, run the checks on the
merged result: green on the branch says only that the branch was green.

Red after the merge stops the work: branch and worktree stay, and the failure is the next
thing you say.

Deleting a branch, a worktree or a change directory is not one of the options: only a
direct request, confirmed separately.

## Rationalizations

| Excuse | Reality |
|---|---|
| "fourteen task-scoped reviews beat one tired end-of-change skim" | Fourteen diffs against fourteen tasks answer no question about the change. |
| "it costs you nothing on the Friday clock: it happens after the archive" | After the archive there is no change left to fix it in. |
| "so if it exits `0` the gate held" | Three machine checks held. A contradicted decision passes all three. |
| "If you reaffirm, that's your call and I'll make the edit without re-arguing it" | The offer is the edit, one message later. |
| "This should exit `0`" | The command decides that, not the argument that it would. |
| "the archive command is queued to run against it" | A run you have not made has no result. |

## Red flags - stop

- The archive command run with no verification report in this conversation.
- A file under `lexforge/specs/` edited by hand while a conflict is open.
- A branch merged, pushed or deleted before the user answered.
- An exit code named instead of read.
