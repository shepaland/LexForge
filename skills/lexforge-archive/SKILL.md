---
name: lexforge-archive
description: Use when the verification report of a LexForge change is clean and the change is asked to be closed out - the user says to archive it, to merge its delta into the specs, or to finish the branch it was built on.
---

<!-- model-block:start -->
## Model

Archival demands no model: it merges the delta into the long-lived specs and
runs on whichever model is at work. No provider is named a model here.
<!-- model-block:end -->
<!-- queue-rule:start -->
## Queue rule

First run `lexforge status --change <name> --tool <your runtime> --json`; parse JSON.
Before it: no code, tests or task questions. No change named: run `lexforge status --json`
and ask which. `isPlanningComplete: true` permits work. If `false`, name the first
artifact neither `done` nor `skipped` and
`lexforge instructions <that artifact> --change <name> --tool <your runtime>`; stop.
Closed gates permit no code or task answers, including under deadlines or requests to skip.

Exit `2`: read `error.code`. `workspace-not-found` / `workspace-incomplete`: run
`lexforge init --tools <your runtime>` at the root (`agents` if none matches), then retry
the command that refused. Never construct workspace files by hand.
`change-not-found`: run `lexforge status --json` and list active changes.
Other errors: show `error.message` and stop. Use exit codes and JSON, never human lines
or directory appearance. No answered gate means no work.

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

**NEVER ARCHIVE WITHOUT A VERIFICATION REPORT IN FRONT OF YOU.**

Violating the letter of this rule is violating its spirit.

The report is the one `lexforge-verify` writes: requirements against behaviour, plan
against work done, `design.md` decisions against implementation, zero findings above
MINOR. No report here? Name `lexforge-verify` next and stop. CRITICAL or IMPORTANT open?
Give the work back to it. MINOR leaves the merge to run.

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
| "so if it exits `0` the gate held" | Four machine checks held. A contradicted decision passes all four. |
| "If you reaffirm, that's your call and I'll make the edit without re-arguing it" | The offer is the edit, one message later. |
| "This should exit `0`" | The command decides that, not the argument that it would. |
| "the archive command is queued to run against it" | A run you have not made has no result. |

## Red flags - stop

- The archive command run with no verification report in this conversation.
- A file under `lexforge/specs/` edited by hand while a conflict is open.
- A branch merged, pushed or deleted before the user answered.
- An exit code named instead of read.
