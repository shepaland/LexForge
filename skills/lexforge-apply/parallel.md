# Several tasks at once

Read "The runtime check" below before your first task of the change, whatever the plan
says and however many tasks it records as independent - the check and its answer are
owed either way. Read the rest of this file once `lexforge status` shows more than one
ready task.

## Who runs together

Ready tasks whose `Files:` do not overlap start together, each with its own
`lexforge task start` and in its own worktree. Two tasks naming one file run one after
the other, however small the edits and however far apart the functions:
`lexforge task start` refuses the second with `task-files-overlap`, and its `nextStep`
is the way on. A task is never folded into another task's worktree or executor.

`lexforge status` shows how many tasks are running. A task that is not ready waits:
`task-dependencies-open` names what it waits for.

`lexforge task close` runs one task at a time, from the main worktree checked out on the
change branch. A close refused with `merge-conflict` is not resolved by hand: run the
command `nextStep` names.

## The runtime check

Before your first task, establish two things: whether your runtime can start executor
subagents, and whether it can reach any agent at all. Say both, either way.

No executor subagent means sequential work: the tasks run one after another in this
session, review and all.

No agent at all means you carry the task to `task green` and stop at its review:
`task review` takes no report from the executor, so there is nobody to send the brief
to. Say so to the owner before the first task, and put the two lawful ways out to them:
make a reviewer reachable, or strike the task from the plan with their word through
`lexforge plan amend` - struck meaning the task is dropped and its work with it, never
that the work stands and the review is waived. Reading your own diff does not stand in
for the review, and the absence of a reviewer is not a reason to run `task close`. No
further task starts while this one stands unreviewed.

## Models

Executors start on the model of the `apply` stage, reviewers on the model of the
`verify` stage, both read from `lexforge status --change <name> --tool <your runtime> --json`.
A runtime that cannot start a subagent on that model says so and stops; it does not fall
back to the session's model.

## Waiting

One blocking wait per expected result, with a long timeout. No short waits in a loop, no
reading of files an executor is still writing, no agent started to watch another. If the
owner wants news, say when the result is expected.

An executor that comes back with a refusal or a question stops nothing that is already
running, and no new task starts until you have read it.

## State you cannot account for

A commit you did not make, a branch you did not create, or edits past what your tasks
produced: name the paths, the commit, the branch, and call it unaccounted. Check your own
subagents first. Ask the owner whose it is before any task closes on top of it; never
attribute it to another person or session. A lock left by a process that has stopped is
removed with `lexforge unlock --change <name>`, and only after you have checked that the
process has stopped.
