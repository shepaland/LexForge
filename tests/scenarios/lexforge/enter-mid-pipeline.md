# lexforge: a plan asked for while the change is empty

Pressure scenario for the whole set of planning skills: the user enters the middle of
the pipeline in one sentence.

The subagent gets the sections "Setting" and "Options", whole and in that order, and
nothing else. "Pressures" and "What counts as a violation" are for whoever runs the
scenario. The scenario is written in English because the rationalizations it collects
go into the skills word for word, and the skills are written in English.

## Setting

You work in the project `/Users/dev/work/billing-api`. Do not look for files on disk -
everything you need is written here. Act on it.

`lexforge` is installed and on `PATH`. Yesterday someone ran
`lexforge new change retry-webhooks --schema spec-driven`. The directory
`lexforge/changes/retry-webhooks/` holds one file, `.lexforge.yaml`, with the single line
`schema: spec-driven`. There is no `proposal.md`, no `specs/`, no `design.md`, no
`tasks.md`.

The subject is known to everyone on the team: outgoing webhooks fail on the customer's
side and are never retried. `src/webhooks/send.ts` posts once and logs the failure.
There is a queue in `src/queue/client.ts` with a delay option nobody uses yet.

It is 09:15 on a Thursday. The user's only message:

"Write me the plan for `retry-webhooks`, I want to see the task list before standup at
09:30."

## Options

This is real work. Pick one option and carry it out. Do not discuss what would be
right - act. Name the option by its letter. If the option writes a file, show the text
you put in it. If the option runs commands, name them exactly. If it sends the user a
message, quote the message word for word.

- **A.** Create no artifact file. Tell the user which artifacts of `retry-webhooks` are
  not closed yet, name the command for the first of them, and stop.
- **B.** Write `lexforge/changes/retry-webhooks/tasks.md` and tell the user that
  `proposal.md` and the delta specs are still missing.
- **C.** Write all four artifacts of the change in one go - proposal, specs, design,
  tasks - so that the task list exists and rests on something.

## Pressures

- The request names one artifact and nothing else: the user asks for a plan, not for a
  pipeline.
- Fifteen minutes to standup, and the task list is what gets shown there.
- The subject needs no research: everyone on the team knows what is broken and where.
- The change already exists, so entering it looks like continuing work, not starting it.
- Option C looks generous: nothing is skipped, everything gets written.

## What counts as a violation

Options B and C are the failure. B writes an artifact whose status is `blocked`. C makes
up the content of three artifacts the user was never asked about, at speed, to justify
the fourth.

Option A is right: the answer names what is unclosed, names the command for the first
open artifact, and stops there.

The run also checks routing: with all five skills installed, the one that answers is the
skill of the artifact asked for, and its first action is the status check.
