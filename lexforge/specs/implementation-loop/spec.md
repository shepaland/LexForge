# implementation-loop

## Purpose

What happens inside a single plan task: what the TDD loop looks like, who looks at the
result before the checkbox closes, what goes into the reviewer's context, and what the
skill does when a task pulls in work that no delta requirement describes.

## Requirements

### Requirement: Tasks run one at a time in plan order

The skill `lexforge-apply` SHALL take tasks in order of number and SHALL start each task with
`lexforge task start`. A task SHALL be closed only by `lexforge task close`: red run recorded on
the test commit, green run recorded, review registered, checks passed, branch merged and
checkbox marked by the CLI.

Tasks whose dependencies are closed and whose declared files do not overlap SHALL be exempt from
the order, and only from the order: each of them SHALL run in its own worktree opened by
`task start`, through the whole loop. Two tasks SHALL NOT run in one worktree. A task whose
dependencies are not closed SHALL wait its turn.

Merging tasks into one pass SHALL NOT be allowed. A task's small size, a shared file, and
matching wording between neighboring tasks are not grounds for merging them.

#### Scenario: Three small tasks in a row

- **WHEN** tasks 2.1, 2.2, and 2.3 touch one file and together add twenty lines
- **THEN** their files overlap, so the skill goes through them one at a time and the CLI closes
  three checkboxes with three separate `task close` runs

#### Scenario: A task needs the result of a later one

- **WHEN** task 3.2 cannot be done without what task 3.5 produces
- **THEN** the skill stops and names the defect in the plan, instead of silently reordering
  the tasks

#### Scenario: Two independent sections

- **WHEN** sections 4 and 5 both say `Depends on: none`, their tasks 4.1 and 5.1 share no file,
  and the runtime can start executor agents
- **THEN** each starts with its own `task start`, runs in its own worktree with its own executor,
  and is closed by its own `task close`

#### Scenario: A section with no concurrent neighbour

- **WHEN** no task of another section is ready at the same moment as task 3.1
- **THEN** task 3.1 runs alone, and no second task is started beside it

### Requirement: A failing test is observed before the implementation

Before the implementation of a task is written, the executor SHALL commit the test alone and the
red run SHALL be recorded by `lexforge task red` on that commit. The record holds the commit,
the exit code and the tail of the output; a line quoted in an answer SHALL NOT replace it.

The implementation SHALL be committed after the red commit. A failure reported by another
agent, summarised from another agent's output, or reasoned about from the code SHALL NOT count
as red, and SHALL NOT let the task close.

A test green on its first run SHALL be treated as defective: it is rewritten, committed and run
again. A run that ends on an infrastructure error SHALL NOT count as the failure, except a
missing module the task declares as new.

Implementation already standing in the tree SHALL NOT be committed before the red run: the
task's worktree starts from the change branch, the test is committed first, and the
implementation follows in a later commit.

#### Scenario: The failure comes from another agent

- **WHEN** a task's implementation is written by an agent whose only evidence of the red run
  is a line quoted in another agent's report
- **THEN** no red run is recorded for that task, and `task green` refuses with `red-missing`

#### Scenario: The implementation is already written

- **WHEN** a thousand lines of implementation sit in the tree with no red run behind them
- **THEN** the test is committed alone in the task worktree, `task red` records the failure on
  that commit, and the implementation is committed after it

#### Scenario: The test passed right away

- **WHEN** a newly committed test comes back green
- **THEN** `task red` refuses with `red-run-passed`, and the test is rewritten before any
  implementation is written

#### Scenario: A failure for the wrong reason

- **WHEN** a test fails with a message about a module that the task does not declare
- **THEN** `task red` refuses with `red-run-broken`, the call is fixed, and the run is repeated
  until the test's assertion fails

#### Scenario: A ten-line change

- **WHEN** a task changes one line of a function and the user is pushing to hurry
- **THEN** the test is still committed alone and `task red` records the failure before the
  change is committed

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

### Requirement: Review findings close before the checkbox

Findings at levels CRITICAL and IMPORTANT SHALL close before the checkbox is marked:
`task close` SHALL refuse with `findings-open` while the latest review holds one. The checkbox
SHALL be marked only by `task close`, never by hand.

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
- **THEN** the skill quotes the requirement, shows the test, and a new review without the
  finding is registered before `task close`

### Requirement: A task that outgrows the spec stops the work

During implementation the skill SHALL go to the owner in four cases only: the plan lacks a task
or a file; a decision changes visible behaviour and the plan did not take it; a task is blocked
and no way out exists without a guess; the plan is finished. Every other fork SHALL be decided by
the agent and recorded with `lexforge journal add --kind ruling` and its reason.

A missing task or file SHALL be added to the plan only through
`lexforge plan amend --quote` with the owner's words, followed by a review with
`--angle amendment`. Work that no requirement in the change's delta specs describes SHALL stop
the task and go back to the delta spec through `lexforge-spec` or to a separate change.

Doing the work silently SHALL NOT be allowed. Silently adding the requirement to the delta
after the fact SHALL NOT be allowed either: a requirement written after the code describes
the code, not the task.

#### Scenario: A bug found along the way

- **WHEN** a bug turns up in a neighboring module during a task, fixable in three lines
- **THEN** the skill stops, names the finding to the owner as a missing task, and makes no change
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

An executor SHALL NOT start a reviewer, whatever its runtime allows: after `task green` the
executor returns, and the session starts the reviewer of the task. A task whose `Depends on:`
names a task that is not closed SHALL NOT be started, so no task is written on top of a task
nobody has reviewed.

A runtime that can start no agent at all SHALL reach no reviewer either. The skill SHALL say so
before the first task, SHALL work the first task to green, and SHALL stop at its review with no
`task close` run. It SHALL put the two lawful ways out to the user: make a reviewer reachable,
or strike that task from the plan with their word through `lexforge plan amend` - struck
meaning the task is dropped and its work with it, never that the work stands and the review is
waived. Reading one's own diff SHALL NOT stand in for the review, the absence of a reviewer
SHALL NOT be a reason to close the task, and no further task SHALL be started while the first
stands unreviewed.

#### Scenario: The runtime can start them

- **WHEN** implementation begins and the runtime can start executor subagents
- **THEN** the skill says so before the first task, and tasks whose dependencies are closed and
  whose files do not overlap run in parallel, each in its own worktree

#### Scenario: The runtime cannot start them

- **WHEN** implementation begins and no executor subagent can be started
- **THEN** the skill says so and works through every task one at a time, review and all

#### Scenario: An executor that cannot review

- **WHEN** the runtime starts executor agents but an executor of it cannot start a reviewer, and
  task 4.2 says `Depends on: 4.1`
- **THEN** the executor of 4.1 returns after `task green`, the session starts the reviewer and
  runs `task close`, and only then is task 4.2 started

#### Scenario: No agent of any kind

- **WHEN** the runtime's tool list holds nothing that starts an agent, so neither an executor nor
  a reviewer can be reached
- **THEN** the skill says so before the first task, works task 2.1 to green, stops at its review
  with no `task close` run, and starts no further task

#### Scenario: A plan with no independent tasks

- **WHEN** the plan records no task as independent of another
- **THEN** the check still happens and its answer is still stated before the first task

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

### Requirement: Subagents run on the model of their stage

The session SHALL start each executor on the model `stages` assigns to `apply` and each
reviewer on the model it assigns to `verify`, read from `lexforge status --json`. With an
empty assignment, the model block of the skill applies. A subagent SHALL NOT inherit the
session's model by default.

#### Scenario: A session on a heavier model

- **WHEN** the session runs on Opus and `apply` resolves to a Sonnet model
- **THEN** the executors start on the Sonnet model

### Requirement: The executor's brief is the context output

The executor's brief SHALL be the file `lexforge/changes/<name>/tasks/<id>/brief.md` written by
`lexforge task start`, with the instruction to work in the worktree it names. The brief SHALL
NOT hand over the full plan, the full design or a shared brief file.

#### Scenario: A shared brief file

- **WHEN** the session is about to tell an executor to read a shared brief file before work
- **THEN** it sends the path of the brief that `task start` wrote for that task instead

### Requirement: Waiting on a subagent does not poll

On a runtime with a blocking wait for a subagent, the session SHALL wait with one blocking
call per expected result and SHALL NOT call the wait in a loop with a short timeout.

#### Scenario: Codex waits on an executor

- **WHEN** a Codex session has dispatched an executor
- **THEN** it waits with one `wait_agent` call with a long timeout instead of repeated short
  waits

### Requirement: A task executor starts no agent, and the session starts every one

An executor started for a task SHALL start no agent of any kind: not an executor, not a
reviewer, not an agent that inherits its context, not an agent handed its brief or any part of
it, not an agent asked for extra hands, and not any type its runtime offers for delegating to
itself.

The session that holds the plan SHALL start every agent of the implementation stage - each
executor and each reviewer - and no agent SHALL be started by anything else.

The test SHALL hold by effect, because a runtime can invent a type next month that this list
does not name: an agent that continues the caller's work instead of looking at it is the one
this rule refuses, whatever its type is called. A name the runtime gives the type SHALL NOT
make it lawful, and neither SHALL an intent to review the result afterwards.

Work that came from an agent an executor started SHALL close no task, however much code stands
in the task worktree. The lawful path is `lexforge task abandon` and a new `task start`, so the
red run is taken again on a commit that holds the test only.

Reaching a token budget SHALL NOT be a reason to start one: the executor SHALL stop, SHALL
return what it committed, and SHALL name what it did not reach.

#### Scenario: A fork inherits the task brief

- **WHEN** the executor of task 1.6 starts a subagent of a type that inherits its full context,
  and that subagent writes the test and the implementation of task 1.6
- **THEN** the executor's report names the violation, task 1.6 is not closed, and the session
  abandons it with `lexforge task abandon --change demo --task 1.6`

#### Scenario: An agent asked only to help

- **WHEN** the executor of task 2.1 is behind and starts one more agent to write the test while
  it writes the implementation
- **THEN** that agent is the forbidden one, and task 2.1 stays unclosed

#### Scenario: An executor starts the reviewer of its task

- **WHEN** the executor of task 2.1 records the green run and starts a reviewer agent itself,
  with the brief from `reviewer-prompt.md`, instead of returning to the session
- **THEN** that dispatch is the forbidden one too, and task 2.1 stays unclosed until the session
  starts the reviewer itself

### Requirement: A dispatched agent holds one task within a token budget of 300,000

An agent the implementation stage dispatches - the executor of a task or the reviewer of a task -
SHALL be given one task, SHALL be given work that fits inside 300,000 tokens of its own use, and
SHALL NOT exceed that budget. One executor SHALL NOT hold two tasks: each task gets its own
executor through its own `task start`.

An agent that reaches the budget with its task not green SHALL stop, return what it committed,
and name what it did not reach. It SHALL NOT start another agent to carry on its own work, and
reaching the budget SHALL NOT be a reason to. The task stays unclosed.

#### Scenario: Two tasks for one executor

- **WHEN** the session is about to hand tasks 3.1 and 3.2 to one executor
- **THEN** each task is started with its own `task start` and its own executor

#### Scenario: An executor reaches the budget before green

- **WHEN** the executor of task 3.1 reaches 300,000 tokens of its own use after the red run and
  before the implementation passes
- **THEN** it stops, returns what it committed, names what it did not reach, starts no further
  agent, and task 3.1 stays unclosed

### Requirement: A dispatched agent's budget is held by reading discipline on its task

A dispatched agent's token budget is spent by reading, and the discipline that keeps it inside
the budget SHALL be reading discipline.

Together with the brief of `task start`, the session SHALL hand the executor the line numbers of
the places it has to work on, found once by the session before the executor starts, so that the
executor does not spend its own budget finding them again.

A dispatched agent SHALL NOT read a large file whole. It SHALL find its place with a
line-numbered search and read the range around it instead.

While a task is being fixed, a run SHALL name the single test being fixed rather than the whole
file. The task's `Command:` SHALL run in full at `task red` and `task green`, where the CLI runs
it.

The size of a task SHALL be judged by the reading it demands, not by the number of lines it
changes.

#### Scenario: The brief comes with line numbers found once

- **WHEN** the session starts an executor for a task that fixes an assertion inside a file
  thousands of lines long
- **THEN** the session hands the line numbers of the place to fix with the brief, found once,
  and the executor does not spend its own budget searching for them again

#### Scenario: A dispatched agent searches instead of reading whole

- **WHEN** an executor needs to see the code around a line it was not given
- **THEN** it finds the place with a line-numbered search and reads the range around it, and
  does not read the whole file

#### Scenario: A fix names its one test until green

- **WHEN** the implementation of a task has not yet turned the target assertion green
- **THEN** every run of the executor names the single failing test, and the task's `Command:`
  runs in full at `task green`

