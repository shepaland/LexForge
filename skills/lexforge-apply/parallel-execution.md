# Parallel execution

Read this before your first task of this change, whatever the plan says and whether or
not the change is already under way. It decides how a wave runs; the task-by-task loop
in `SKILL.md` still runs inside every dispatched section.

A task itself is never merged into another: a small diff, a shared file, and lookalike
wording are not reasons. Implement only the behaviour the run failed on - no extra
flag, branch, or tidy-up added along the way.

## Unaccounted state in the tree

A commit on the branch you did not make, a branch you did not create, or edits in the
tree past what your own tasks produced is not proof somebody else is working alongside
you. Name what you found - the paths, the commit, the branch - written out, and call it
unaccounted: state you cannot explain, not state you can assign to a person. Check your
own dispatches first - a subagent you started and then lost track of is the likeliest
author, and its work is the one case you answer for. Stop and ask the user whose it is
before any task closes on top of it; they know, you are guessing. Never attribute it to
a foreign session, a parallel editor, another user, or a tool running in the background
- an attribution is a claim about a person made with no evidence, and it turns your own
mess into somebody else's. Work does not continue over it: a run over a tree you cannot
account for measures nothing, and a checkbox resting on it rests on nothing.

## The runtime check

In your first message about this change, before your first task, establish two
things: whether your runtime can start executor subagents, and whether it can reach any
agent at all. Say both, either way, not only on a good outcome. A runtime with no
executors leaves the work sequential: say so, and do not treat the absence as a reason
to merge tasks or to skip the review after a task.

Where the runtime can reach no agent at all, the session works the first task through
the loop itself, up to green, and stops there at its review, unmarked. It offers the
user two lawful ways out - make a reviewer reachable, or strike that task from the plan
in the user's own words - and waits for their answer before opening anything else.

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

A ready section whose tasks carry more than one group label is not one executor: the
dispatching skill reads the group labels of the section and dispatches one executor per
distinct label, concurrently. Each group's executor works its own tasks through test, the
failure watched and recorded, the implementation, and the green run - and there it stops:
it starts no agent, and it returns its result to the session. The session dispatches the
reviewer for that group's work as its own agent, closes what the review finds, and ticks
that group's boxes. A section whose tasks all carry one label is one executor, exactly as a
section with no concurrent neighbour is today; two groups of one section are never merged
into one pass, folded into one executor, or run as a pair, whatever their size. An executor
dispatched for a group touches no task carrying a different label. The wave boundary and its
stamp stay where they are - taken once, after every group of the wave has come back, never
after one group of a still-running section.

## The cycle

A cycle is the TDD triple: the task that writes the test, the task that runs it and
watches it fail, and the task that writes the implementation, with its green run. The
session dispatches one executor per cycle.

The executor returns its result to the session at the end of the cycle and marks no
checkbox. The session then dispatches the reviewer for that cycle as its own agent,
closes every CRITICAL and IMPORTANT finding before ticking any checkbox, ticks the boxes
of the cycle, and only then dispatches the next executor. No cycle's tasks are written on
top of a cycle nobody has reviewed.

## What a dispatched agent is handed

The `lexforge-apply` rule, verbatim, together with its "Task order", "Review before the
checkbox" and "Past the delta" sections. "Task order" opens by pointing back at this
file; that step is already done, by the session that read the plan - the wave is
decided once, not recomputed inside a section, and the executor starts no agent over
it: not a further executor, not a reviewer, not any type its runtime offers for
delegating to itself. It returns to the session, which dispatches the reviewer.

Also handed: the change name; `context` and `rules` from `lexforge/config.yaml`; the
section's tasks; the requirements and decisions they trace to; and the instruction that
it never touches `tasks.md` itself: for an executor, the loop's last step is not the
checkbox but that task's own entry in the report it returns.

The executor runs on the model `stages.apply` assigns, read from
`lexforge status --change <name> --tool <your runtime> --json`. A runtime that cannot
start an agent on that model starts no executor agent at all: say so, and run the work
sequentially in this session.

It commits nothing - two executors committing at once would race on git's own index
lock - and it runs only the checks its own tasks name, never the whole suite: a
neighbour's half-finished edit would make a wider run mean nothing either way, its own
output would cost the budget too, and the wave-boundary `lexforge evidence record` is
the one full run that counts.

Also part of what it is handed: the line numbers of the places it has to work on, found
once by the session before the agent starts, so the agent does not spend its own budget
finding them again. A dispatched agent does not read a large file whole: it finds its
place with a line-numbered search and reads the range around it instead. While a cycle
is being fixed, a run names the single test being fixed rather than the whole file, and
the whole file runs once, at the end of the cycle. The size of a dispatched part is
judged by the reading its tasks demand, not by the number of tasks it holds.

## The token budget

An agent the implementation stage dispatches - an executor for a section, a reviewer for a
task - is handed work that fits inside a token budget of 300,000, and does not exceed it. An
executor dispatched for a group is a dispatched agent like any other and holds the same
budget.

A section whose work does not fit inside the budget is dispatched in parts, each part small
enough to fit, down to one agent per task where nothing larger fits.

An agent that reaches the budget with work left stops, returns the tasks that are green and
reviewed, and names the tasks it did not reach; those tasks stay unticked.

It starts no agent to carry on its own work, and reaching the budget is not a reason to: an
agent that runs out of room and reaches for another agent to finish is the failure this file
exists to stop.

## What an executor may start

An executor dispatched for a section starts no agent, of any kind. The session that
holds the plan starts every agent of the implementation stage - each executor and each
reviewer - and no agent is started by anything else.

Unlawful by type, not only by role: an agent that inherits the calling session's
context, such as a `fork`; an agent handed the section brief or any part of it; an agent
started to ask for a second pair of hands; a reviewer started by the executor instead of
the session; and any type the runtime offers for delegating to oneself. These are
examples, not a closed list. A name the runtime gives the type does not make it lawful,
and neither does an intent to review the result afterwards.

The test holds by effect, which is what survives a runtime inventing a new type next
month: an agent that continues the executor's own work instead of looking at it is the
forbidden one, whatever its type is called. A reviewer reads and judges; anything that
writes, runs, or decides on the executor's behalf is an executor.

An executor that started one reports the violation in the entry of every task it
touched and marks no checkbox for those tasks; the dispatching skill treats them as
unclosed whatever code stands in the tree. The code is not thrown away - take the
implementation out, watch it fail, and put it back inside the same task.

## Rationalizations

| Excuse | Reality |
|---|---|
| "each task closed behind its own freshly dispatched `general-purpose` reviewer, the same as 1.1-1.5, never a further executor" | A reviewer is an agent. You started it; the rule ends there. |
| "this doesn't start a further executor, so it clears that specific bar" | The bar is any agent at all, not a further executor. |
| "I start no `fork` and no further executor of any kind for the *doing*" | "Of any kind" carries no clause about the doing. The reviewer is the agent you just started. |

## The checkbox and the stamp

The executor never edits `tasks.md` (see above). Whether one report covers a whole
section or one task, it carries, per task: the diff of the files that task names, the
failing line of the run it watched fail, quoted, the command that confirmed it and its
last output. The reviewer's verdict is not the executor's to carry: the session starts
the reviewer, and the session reads what it comes back with. A group's executor returns
one entry per task of its own group and ticks nothing. An entry with no quoted failure
is not a green entry: send it back, or run that task in this session.

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
