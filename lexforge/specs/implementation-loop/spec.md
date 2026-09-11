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

The implementation SHALL be written after a test run whose failure was seen with one's own
eyes. The skill SHALL quote the failing line in its reply before writing the first line of
the implementation.

The reason for the failure SHALL match the missing behavior. A failure from an import
error, a typo in a name, or a project that fails to build does not count as a run: the test
gets fixed and run again.

A test that passes on its first run SHALL be considered defective: it is checking something
that already exists.

The rule SHALL hold at any size of change. Ten lines, a deadline tonight, and four hundred
existing tests do not lift it.

#### Scenario: The test passed right away

- **WHEN** a new test is green on its first run
- **THEN** the skill rewrites the test so it checks the required behavior, and runs it again

#### Scenario: A failure for the wrong reason

- **WHEN** a test fails with a message about a module that cannot be found
- **THEN** the skill fixes the call, runs it again, and waits for a failure on the test's
  assertion

#### Scenario: A ten-line change

- **WHEN** a task changes one line of a function and the user is pushing to hurry
- **THEN** the skill still runs the test and shows the failure before the change

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

The skill SHALL send a reviewer subagent after every task and before marking the checkbox.
This SHALL NOT be replaced by the agent's own read of its own change.

The reviewer SHALL work read-only: it does not edit the working tree, does not move `HEAD`,
and does not launch subagents of its own.

The reviewer's reply SHALL carry strengths, findings at levels CRITICAL, IMPORTANT, and
MINOR with a file and line for each, and a verdict.

#### Scenario: A task closed without review

- **WHEN** the run is green and one hour remains before the end of the day
- **THEN** review is still sent, and the checkbox waits on its reply

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
