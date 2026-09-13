# implementation-loop

## Purpose

What happens inside a single plan task: what the TDD loop looks like, who looks at the
result before the checkbox closes, what goes into the reviewer's context, and what the
skill does when a task pulls in work that no delta requirement describes.

## Requirements

### Requirement: Tasks run one at a time in plan order

The skill `lexforge-apply` SHALL take tasks in order of number and SHALL NOT start the next
one until the current one is closed: test written, failure seen, implementation written,
run green, review passed, checkbox marked.

Sections that `tasks.md` records as independent of one another SHALL be exempt from the order,
and only from the order: every task of such a section SHALL still be closed through the whole
loop, one at a time, before its checkbox is marked. A section whose dependencies are not closed
SHALL wait its turn in plan order.

Merging tasks into one pass SHALL NOT be allowed. A task's small size, a shared file, and
matching wording between neighboring tasks are not grounds for merging them, and neither is
running two of them at once.

#### Scenario: Three small tasks in a row

- **WHEN** tasks 2.1, 2.2, and 2.3 touch one file and together add twenty lines
- **THEN** the plan does not record them as independent, the skill goes through them one at a
  time and closes three checkboxes with three separate marks

#### Scenario: A task needs the result of a later one

- **WHEN** task 3.2 cannot be done without what task 3.5 produces
- **THEN** the skill stops and names the defect in the plan, instead of silently reordering
  the tasks

#### Scenario: Two independent sections

- **WHEN** the plan records sections 4 and 5 as independent of each other and the runtime can
  start executor agents
- **THEN** each runs in its own executor agent, its tasks one at a time through the whole loop,
  and each checkbox is marked when that task's own run is green and its own review is closed

#### Scenario: A section with no concurrent neighbour

- **WHEN** no other section is ready at the same moment as section 3
- **THEN** section 3 runs in the session that read the plan, task by task, and no executor agent
  is dispatched for it

### Requirement: A failing test is observed before the implementation

Before the implementation of a task is written, the skill SHALL run the test and SHALL quote
the failing line of that run in its answer.

The observer SHALL be whoever writes the implementation of that task. A failure reported by
another agent, summarised from another agent's output, or reasoned about from the code SHALL
NOT count as observed, and SHALL NOT let the task close.

The run SHALL be recorded with `lexforge evidence red`, taking this change, this task id and
the command, before the implementation is written: the record is what the check before
completion reads, and a line quoted in an answer dies with the session.

A test green on its first run SHALL be treated as defective: it is rewritten and run again. A
run that ends on a missing module, an import error, or a typo SHALL NOT count as the failure:
it is fixed and run until the assertion fails.

Implementation already standing in the tree SHALL be taken out, the failure observed, and the
implementation put back inside the same task. Where the user forbids that, the skill SHALL
put two ways out - let the failure happen, or strike the task - and SHALL NOT tick the
checkbox either way.

#### Scenario: The failure comes from another agent

- **WHEN** a task's implementation is written by an agent whose only evidence of the red run
  is a line quoted in another agent's report
- **THEN** the failure is not observed, no red record exists for that task, and the checkbox
  stays open

#### Scenario: The implementation is already written

- **WHEN** a thousand lines of implementation sit in the tree with no red run behind them
- **THEN** the work is taken out, the red is observed and recorded per task, and the work is
  put back inside the task it belongs to

#### Scenario: The test passed right away

- **WHEN** a newly written test comes back green
- **THEN** the test is treated as defective, rewritten, and run again before any
  implementation is written

#### Scenario: A failure for the wrong reason

- **WHEN** a test fails with a message about a module that cannot be found
- **THEN** the skill fixes the call, runs it again, and waits for a failure on the test's
  assertion

#### Scenario: A ten-line change

- **WHEN** a task changes one line of a function and the user is pushing to hurry
- **THEN** the skill still runs the test, shows the failure before the change, and records it
  with `lexforge evidence red`

### Requirement: The implementation is written to the minimum the observed failure requires

The implementation SHALL close exactly the behavior the test failed on. Parameters, flags,
branches, and case handling that appear in neither the test nor a delta requirement SHALL
NOT be added along the way.

#### Scenario: A flag added along the way

- **WHEN** an optional parameter that would be useful later suggests itself while writing
  the function
- **THEN** the parameter is not added, and whether it is needed becomes a question for the
  user

#### Scenario: Nearby code asks for a rewrite

- **WHEN** code nearby is found that deserves a rewrite
- **THEN** the change is not made inside this task

### Requirement: A reviewer subagent looks at the work after each task

The session SHALL dispatch a reviewer agent after each cycle and before ticking any
checkbox of that cycle. This SHALL NOT be replaced by the executor's own read of its own
change, and the executor SHALL NOT dispatch that reviewer itself.

The reviewer SHALL work read-only: it does not edit the working tree, does not move `HEAD`,
and does not launch subagents of its own.

The reviewer SHALL NOT execute the project: it runs no test, no build, and no script of the
change under review. It reads the diff and the run output it was handed. A verdict resting on
a run the reviewer made itself SHALL NOT be accepted, and the brief SHALL be sent again
saying so.

The reviewer's reply SHALL carry strengths, findings at levels CRITICAL, IMPORTANT, and
MINOR with a file and line for each, and a verdict.

#### Scenario: A task closed without review

- **WHEN** the cycle's run is green and one hour remains before the end of the day
- **THEN** review is still sent by the session, and the checkbox waits on its reply

#### Scenario: The reviewer runs the suite

- **WHEN** the reviewer's reply rests its verdict on a pytest run it started itself
- **THEN** the verdict is not accepted, and the brief is sent again saying the reviewer runs
  nothing

#### Scenario: The reviewer answers in generalities

- **WHEN** the reviewer's reply is "looks good" with not one reference to a file and line
- **THEN** the reply is not accepted, and the request is sent again pointing out the empty
  review

### Requirement: The reviewer's context is assembled by hand

The reviewer's assignment SHALL include: the task text with links to requirements, the
actual requirements from the change's delta specs, the decisions in `design.md`, the commit
range from the task's base to the current state, the command that confirms the task and its
output, and the project rules from `lexforge/config.yaml`.

The assignment SHALL NOT include: the session's history, the implementer's reasoning, the
user's messages about deadline and scope, previous reviews' replies, or the analysis of
neighboring tasks.

#### Scenario: A deadline in the reviewer's context

- **WHEN** the user is pushing to finish today
- **THEN** that line is absent from the reviewer's assignment: the deadline is not the
  reviewer's call

#### Scenario: The reviewer asks for the conversation history

- **WHEN** the reviewer replies that it needs the session's history
- **THEN** it is given the requirements, the decisions, and the commit range instead of the
  history

### Requirement: Review findings close before the checkbox

Findings at levels CRITICAL and IMPORTANT SHALL close before the checkbox is marked.

A finding at level MINOR SHALL either be fixed now or be recorded in the defect ledger with
`lexforge defect record`. Findings SHALL NOT stay only in the agent's memory.

Disagreement with the reviewer SHALL be expressed with an argument backed by evidence —
code, a test, or a line from a requirement. Silent agreement and silent dismissal are
equally unacceptable.

#### Scenario: A MINOR finding set aside for later

- **WHEN** the reviewer finds a duplicated piece of code and calls it MINOR
- **THEN** the finding is either fixed or recorded in the ledger with its file and its line

#### Scenario: The reviewer is wrong

- **WHEN** a CRITICAL finding rests on a misreading of a requirement
- **THEN** the skill quotes the requirement, shows the test, and explains why the finding is
  dismissed

### Requirement: The checkbox closes right away; the stamp is taken at the wave boundary

The mark `- [x]` SHALL go into `tasks.md` right after the run is green and review findings
are closed. Marking a batch of checkboxes at the end of the work SHALL NOT be allowed:
closed tasks and open ones stop being distinguishable.

`lexforge evidence record --change <name> --label tests` SHALL run once every dispatched
section of the wave has come back and its checkbox is marked. An executor agent working a
section SHALL NOT run it: a stamp taken while another agent is still writing describes a state
of the code that never existed.

An exit code of `1` SHALL leave the wave unclosed: no further section is dispatched, and the
next step is reading the failure. The checkboxes already marked SHALL stay marked, each resting
on its own green run, and the change SHALL NOT pass `lexforge verify` until a stamp comes back
green.

Where no section runs in parallel with another, the wave is one section and the boundary is the
task boundary it always was.

#### Scenario: Five tasks, one checkbox

- **WHEN** five tasks are done and their marks are all set at once at the end
- **THEN** this is a violation: each mark is set at the moment its own task closes

#### Scenario: A red stamp

- **WHEN** `lexforge evidence record` returns `1` at the end of a wave
- **THEN** no further section is dispatched, the next step is reading the failure, and the
  marked checkboxes stay marked

#### Scenario: Two sections in one wave

- **WHEN** sections 4 and 5 run in parallel and both come back green
- **THEN** both checkboxes are marked, and one stamp is taken after the second agent returns

### Requirement: A task that outgrows the spec stops the work

A task SHALL be considered to have outgrown the spec when the work it calls for is
described by no requirement in the change's delta specs, or contradicts a decision in
`design.md`.

In that case the skill SHALL stop and name the user three legitimate outcomes: drop the
work as unnecessary, go back to the delta spec and add the requirement through
`lexforge-spec`, or open a separate change.

Doing the work silently SHALL NOT be allowed. Silently adding the requirement to the delta
after the fact SHALL NOT be allowed either: a requirement written after the code describes
the code, not the task.

#### Scenario: A bug found along the way

- **WHEN** a bug turns up in a neighboring module during a task, fixable in three lines
- **THEN** the skill stops, names the finding and the three outcomes, and makes no change
  inside the current task

#### Scenario: A requirement is missing

- **WHEN** a plan task calls for behavior that no delta requirement describes
- **THEN** the skill stops and proposes going back to the delta spec

#### Scenario: Editing the delta after the fact

- **WHEN** the work is already done, and a requirement is added to match it
- **THEN** this is a violation: the stop was due before the work

### Requirement: The runtime is checked for parallel executor agents

Before the first task of a change, the skill `lexforge-apply` SHALL establish whether its
runtime can start executor subagents, and SHALL say what it found.

The check SHALL NOT be optional and SHALL NOT be skipped because the plan records no
independent tasks: the answer is stated either way.

A runtime that cannot start them SHALL leave the work sequential. The skill SHALL say so and
SHALL NOT treat the absence as a reason to merge tasks or to skip the review after a task.

The check SHALL also establish whether an executor agent of this runtime can start a reviewer of
its own. Where it cannot, a dispatched executor SHALL carry out one task and return, and the
dispatching skill SHALL review that task and mark its checkbox before dispatching the next task
of the same section. No task SHALL be written on top of a task nobody has reviewed.

A runtime that can start no agent at all SHALL reach no reviewer either. The skill SHALL say so
before the first task, SHALL work the first task to green, and SHALL stop at its review with no
checkbox marked. It SHALL put the two lawful ways out to the user: make a reviewer reachable, or
strike that task from the plan with their word - struck meaning the task is dropped and its
work with it, never that the work stands and the review is waived. Reading one's own diff SHALL NOT stand in for the
review, the absence of a reviewer SHALL NOT be a reason to tick, and no further task SHALL be
opened while the first stands unreviewed.

#### Scenario: The runtime can start them

- **WHEN** implementation begins and the runtime can start executor subagents
- **THEN** the skill says so before the first task, and the plan's independent tasks run in
  parallel

#### Scenario: The runtime cannot start them

- **WHEN** implementation begins and no executor subagent can be started
- **THEN** the skill says so and works through every task one at a time, review and all

#### Scenario: An executor that cannot review

- **WHEN** the runtime starts executor agents but an executor of it cannot start a reviewer, and
  section 4 holds three tasks
- **THEN** the executor returns after task 4.1, the dispatching skill reviews it and marks its
  checkbox, and only then is task 4.2 dispatched

#### Scenario: No agent of any kind

- **WHEN** the runtime's tool list holds nothing that starts an agent, so neither an executor nor
  a reviewer can be reached
- **THEN** the skill says so before the first task, works task 2.1 to green, stops at its review
  with no checkbox marked, and opens no further task

#### Scenario: A plan with no independent tasks

- **WHEN** the plan records no task as independent of another
- **THEN** the check still happens and its answer is still stated before the first task

### Requirement: An executor starts no agent, and the session starts every one

An agent dispatched for a part of the plan SHALL start no agent of any kind: not an
executor, not a reviewer, not an agent that inherits its context, not an agent handed its
brief or any part of it, not an agent asked for extra hands, and not any type its runtime
offers for delegating to itself.

The session that holds the plan SHALL start every agent of the implementation stage - each
executor and each reviewer - and no agent SHALL be started by anything else.

The test SHALL hold by effect, because a runtime can invent a type next month that this list
does not name: an agent that continues the caller's work instead of looking at it is the one
this rule refuses, whatever its type is called. A name the runtime gives the type SHALL NOT
make it lawful, and neither SHALL an intent to review the result afterwards.

Work that came from an agent an executor started SHALL close no checkbox, however much code
stands in the tree. The lawful path to closing those tasks is the one already written: take
the implementation out, watch it fail, and put it back inside the same task.

Reaching a token budget SHALL NOT be a reason to start one: the executor SHALL stop, SHALL
return what is green, and SHALL name what it did not reach.

#### Scenario: A fork inherits the section brief

- **WHEN** an executor holding section 1 starts a subagent of a type that inherits its full
  context, and that subagent writes tasks 1.6 through 1.16 with runs and reviewers of its own
- **THEN** the executor's report names the violation, tasks 1.6 through 1.16 stay unticked,
  and the code those tasks produced closes nothing

#### Scenario: An agent asked only to help

- **WHEN** an executor is behind on a section and starts one more agent to write the tests
  while it writes the implementation
- **THEN** that agent is the forbidden one, and the section's tasks stay unclosed

#### Scenario: An executor starts its own reviewer

- **WHEN** an executor finishes a cycle and starts a reviewer agent itself, with the brief
  from `reviewer-prompt.md`, instead of returning to the session
- **THEN** that dispatch is the forbidden one too, and the cycle's tasks stay unclosed until
  the session starts the reviewer itself

### Requirement: The session dispatches one executor per cycle

The session that holds the plan SHALL dispatch one executor per cycle.

A cycle SHALL be the TDD triple: the task that writes the test, the task that runs it and
watches it fail, and the task that writes the implementation, with its green run.

The executor SHALL return its result to the session at the end of the cycle and SHALL mark
no checkbox.

The session SHALL then dispatch the reviewer for that cycle as its own agent, SHALL close
every CRITICAL and IMPORTANT finding before ticking any checkbox, SHALL tick the boxes of
the cycle, and SHALL dispatch the next executor only after that.

No cycle's tasks SHALL be written on top of a cycle nobody has reviewed.

#### Scenario: An executor returns at the end of the triple

- **WHEN** an executor finishes the test, the watched-red run, and the green implementation
  of one cycle
- **THEN** it returns its result to the session and marks no checkbox itself

#### Scenario: The session reviews before the next dispatch

- **WHEN** a cycle's executor has returned
- **THEN** the session dispatches the reviewer for that cycle, closes its CRITICAL and
  IMPORTANT findings, ticks the cycle's boxes, and only then starts the next executor

#### Scenario: A cycle built on an unreviewed one

- **WHEN** a cycle's tasks are still unreviewed
- **THEN** no further cycle's tasks are dispatched on top of it

### Requirement: Unaccounted state in the working tree stops the work

An edit, a commit, a branch, or a stash that an agent cannot account for by an action of its
own SHALL be called unaccounted, and the agent SHALL stop and report it.

The agent SHALL NOT attribute such state to a foreign session, a parallel editor, another
user, or a tool outside the change, and SHALL NOT treat it as work that closes a task.

The report SHALL name what was seen - the paths, the commit, the branch - and SHALL ask the
user whose the state is before any task is closed on top of it.

#### Scenario: A commit the agent did not make

- **WHEN** an agent finds a commit on the current branch that no task of its own produced
- **THEN** it calls the commit unaccounted, names its hash and files, stops, and asks the
  user, instead of reporting a parallel editor

#### Scenario: Edits from the agent's own subagent

- **WHEN** the unaccounted edits came from a subagent the agent itself started
- **THEN** the agent names its own dispatch as the source rather than a foreign session, and
  the tasks those edits cover stay unclosed

### Requirement: A dispatched agent does not exceed a token budget of 300,000

An agent the implementation stage dispatches - an executor for a section, a reviewer for a
task - SHALL be given work that fits inside 300,000 tokens of its own use, and SHALL NOT
exceed that budget.

A section whose work does not fit inside the budget SHALL be dispatched in parts, each part
small enough to fit inside the budget, down to one agent per task where nothing larger fits.

An agent that reaches the budget with work left SHALL stop, return the tasks that are green
and reviewed, and name the tasks it did not reach.

It SHALL NOT start another agent to carry on its own work, and reaching the budget SHALL NOT
be a reason to.

The tasks it did not reach stay unticked.

#### Scenario: A section too large for one agent

- **WHEN** a section holds nine tasks that the dispatching skill estimates will run a single
  executor past 300,000 tokens
- **THEN** the section is dispatched in parts that each fit inside the budget, no single agent
  carries the whole section, and the part size falls to one task per agent where nothing
  larger fits

#### Scenario: An agent reaches the budget with tasks left

- **WHEN** an executor holding four tasks reaches 300,000 tokens of its own use after
  finishing the second
- **THEN** it stops, returns the two tasks that are green and reviewed, names the two tasks it
  did not reach, and starts no further agent to carry on its own work

### Requirement: A dispatched agent's token budget is held by reading discipline

A dispatched agent's token budget is spent by reading, not by the number of tasks it
holds, and the discipline that keeps it inside the budget SHALL be reading discipline.

The brief a dispatched agent is handed SHALL carry the line numbers of the places it has
to work on, found once by the session before the agent starts, so that the agent does not
spend its own budget finding them again.

A dispatched agent SHALL NOT read a large file whole. It SHALL find its place with a
line-numbered search and read the range around it instead.

While a cycle is being fixed, a run SHALL name the single test being fixed rather than the
whole file. The whole file SHALL be run once, at the end of the cycle.

The whole suite SHALL run only at the wave boundary, where the stamp is taken, because its
own output costs the budget too.

The size of a dispatched part SHALL be judged by the reading its tasks demand, not by the
number of tasks it holds.

#### Scenario: The brief carries line numbers found once

- **WHEN** the session dispatches an executor for a task that fixes an assertion inside a
  file thousands of lines long
- **THEN** the brief names the line numbers of the place to fix, found once by the
  session, and the executor does not spend its own budget searching for them again

#### Scenario: A dispatched agent searches instead of reading whole

- **WHEN** an executor needs to see the code around a line the brief did not number
- **THEN** it finds the place with a line-numbered search and reads the range around it,
  and does not read the whole file

#### Scenario: A cycle names its one test until the end

- **WHEN** a cycle is being fixed and the fix has not yet turned the target assertion
  green
- **THEN** every run inside the cycle names the single failing test, and the whole file's
  own suite runs exactly once, at the end of the cycle

#### Scenario: The whole suite waits for the wave boundary

- **WHEN** a section's cycles are all green and reviewed
- **THEN** the whole suite runs once, at the wave boundary where the stamp is taken, and
  not inside any one cycle before it

#### Scenario: A part sized by task count still exceeds the budget

- **WHEN** a section is split into six tasks against files no one of them rereads whole,
  and a second split of the same section into three tasks against thousand-line files
  still runs one agent past its budget
- **THEN** the split that holds is the one whose tasks demand less reading, not the one
  with fewer tasks, and the next split is sized by the reading its tasks demand

### Requirement: A ready section dispatches one executor per group named in its plan

The dispatching skill SHALL read the group labels of a ready section and SHALL dispatch one
executor per distinct label, concurrently.

The loop each group's executor runs SHALL end at the green run: the test, the failure watched
and recorded, the implementation, and the green run. Review SHALL NOT be part of it.

The executor of a group SHALL return its result to the session at the end of that loop and
SHALL mark no checkbox - the same as the executor of a cycle.

The session SHALL dispatch the reviewer for each group's work as its own agent, SHALL close
every CRITICAL and IMPORTANT finding before ticking any checkbox, and SHALL tick the boxes of
that group.

A section whose tasks all carry one label SHALL be one executor, exactly as a section with no
concurrent neighbour is today. Two groups of one section SHALL NOT be merged into one pass,
folded into one executor, or run as a pair, whatever their size.

An executor dispatched for a group SHALL touch no task carrying a different label: a group's
executor works only the tasks its own label names.

The wave boundary and its `lexforge evidence record` stamp SHALL stay where they are - taken
once, after every group of the wave has come back, never after one group of a still-running
section.

#### Scenario: A section dispatched as two groups

- **WHEN** section 4 is ready and its tasks carry labels `A` and `B`
- **THEN** the dispatching skill starts two executors at once, one holding every task labelled
  `A` and the other every task labelled `B`, and each runs the test, the watched-red run, and
  the green implementation for its own tasks, then returns its result to the session

#### Scenario: The session reviews a group's work after its executor returns

- **WHEN** the group `A` executor of section 4 returns its result to the session
- **THEN** the session dispatches the reviewer for group `A`'s work as its own agent, closes
  its CRITICAL and IMPORTANT findings, and ticks the boxes of group `A`

#### Scenario: A section with one label

- **WHEN** section 2 is ready and every one of its tasks carries the label `A`
- **THEN** the dispatching skill starts one executor for the whole section, as it would for a
  section with no concurrent neighbour

#### Scenario: Groups never merged into one pass

- **WHEN** two groups of section 4 are both ready at once
- **THEN** neither is folded into the other's executor, and no single executor is asked to
  carry both

#### Scenario: An executor stays inside its own label

- **WHEN** the executor holding group `A` of section 4 finishes its own tasks before the
  executor holding group `B` returns
- **THEN** the group `A` executor touches no task labelled `B`, and waits for the wave
  boundary rather than picking up the other group's work

#### Scenario: The stamp waits for every group of the wave

- **WHEN** section 4's group `A` executor and group `B` executor are both dispatched in the
  same wave
- **THEN** `lexforge evidence record` runs once, after both executors have come back and every
  task of the wave is ticked, not after either group alone

