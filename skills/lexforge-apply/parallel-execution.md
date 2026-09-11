# Parallel execution

Read this before your first task of this change, whatever the plan says and whether or
not the change is already under way. It decides how a wave runs; the task-by-task loop
in `SKILL.md` still runs inside every dispatched section.

## The runtime check

In your first message about this change, before your first task, establish three
things: whether your runtime can start executor subagents, whether an executor of it
can start a reviewer of its own, and whether it can reach any agent at all. Say all
three, either way, not only on a good outcome. A runtime with no executors leaves the
work sequential: say so, and do not treat the absence as a reason to merge tasks or to
skip the review after a task.

## A wave is every section ready at once

A section is closed when every one of its checkboxes is marked. A section is
dispatched once every section its `Depends on:` line names is closed - not only a
section marked `none`. The sections ready at the same moment are one wave. A section
with no concurrent neighbour in its wave runs in the session that read the plan, task
by task, through the loop below - no executor agent is dispatched for it. Two or more
sections ready together each run in their own executor agent through the whole loop -
test, red, implementation, green, review, checkbox - the same loop this session runs
for a section it takes alone.

Two sections are never merged into one pass, folded into one, or run as a pair: not for
a shared file, not for matching wording, not for their small size. `lexforge check
plan` already refuses a plan whose concurrent sections name the same file; this rule
invents no weaker one of its own.

No section is dispatched until its own wave closes and its stamp is taken: a section
that becomes ready mid-wave waits for the next one.

A section not yet ready waits in plan order for its wave.

## What a dispatched agent is handed

The `lexforge-apply` rule, verbatim, together with its "Task order", "Review before the
checkbox" and "Past the delta" sections. "Task order" opens by pointing back at this
file; that step is already done, by the session that read the plan - the wave is
decided once, not recomputed inside a section, so the executor dispatches reviewers
only, never a further executor.

Also handed: `reviewer-prompt.md`; the change name; `context` and `rules` from
`lexforge/config.yaml`; the section's tasks; the requirements and decisions they trace
to; and the instruction that it never touches `tasks.md` itself: for an executor, the
loop's last step is not the checkbox but that task's own entry in the report it
returns.

The executor runs on the model `stages.apply` assigns, read from
`lexforge status --change <name> --tool <your runtime> --json`. A runtime that cannot
start an agent on that model starts no executor agent at all: say so, and run the work
sequentially in this session.

It commits nothing - two executors committing at once would race on git's own index
lock - and it runs only the checks its own tasks name, never the whole suite: a
neighbour's half-finished edit would make a wider run mean nothing either way, and the
wave-boundary `lexforge evidence record` is the one full run that counts.

## Whether an executor can review itself

The runtime check above also establishes whether an executor of this runtime can start
a reviewer of its own, and whether it can reach any agent at all.

Where it can: the executor works its whole section, one task at a time through the
full loop - including its own reviewer dispatch - and returns once, its report holding
one entry per task.

Where it cannot: a dispatched executor carries out one task only and returns. The
dispatching skill sends that task to a reviewer itself, with the brief in
`reviewer-prompt.md`, and marks its checkbox before dispatching the executor again for
the next task of the same section. No task is written on top of a task nobody has
reviewed. A CRITICAL or an IMPORTANT the dispatcher's own review finds is closed the
way any finding is: fixed now - behind a run watched fail first, if the fix changes
behaviour - or the task is struck and put back to the user; never left for the next
task to build on.

Where the runtime can reach no agent at all - not an executor, not a reviewer: say so
before the first task, the same as the other two answers. Work the first task through
the loop up to green, then stop at its review: no checkbox is marked without a review
behind it, and reading your own diff does not stand in for one. No task is written on
top of a task nobody has reviewed, so no further task opens while the first stands
unreviewed. Put two lawful ways out to the user - make a reviewer reachable, or strike
that task from the plan with their word - and wait for their answer. Struck means the
task is dropped and its work with it, never that the work stands and the review is
waived.

## The checkbox and the stamp

The executor never edits `tasks.md` (see above). Whether one report covers a whole
section or one task, it carries, per task: the diff of the files that task names, the
failing line of the run it watched fail, quoted, the command that confirmed it and its
last output, and - where the executor could dispatch its own reviewer - that reviewer's
verdict. An entry with no quoted failure is not a green entry: send it back, or run
that task in this session.

The dispatching skill reads a valid entry and ticks that task's box the moment it shows
a green run and a closed review - right away, before dispatching anything else.
Concurrent executors editing the plan file would lose each other's ticks; one skill
applying one report at a time does not.

The executor agent does not run `lexforge evidence record`: a stamp taken while a
neighbour is still writing describes a state of the tree that never existed as a
whole.

The dispatching skill runs `lexforge evidence record --change <name> --label tests`
once, after every section of the wave has come back and its checkboxes are marked -
the wave boundary. Where no section runs in parallel with another, the wave is one
section and the boundary is the task boundary it always was.

## One executor comes back red while others are still running

A section that comes back without every one of its tasks green and reviewed is the
wave's failure. Its report is still read right away, the same as any other: each task
in it whose own entry shows a green run and a closed review is ticked, whichever
section it came from - only the tasks it never reached stay unticked. What changes for
the wave: dispatch no further section, and let the executors still running finish
before the failure is read. No stamp is taken.

## A red stamp

An exit code of `1` from `lexforge evidence record` leaves the wave unclosed: dispatch
no further section, and the next step is the failure. The checkboxes already marked
stay marked, each resting on its own green run; the change does not pass
`lexforge verify` until a stamp comes back green.
