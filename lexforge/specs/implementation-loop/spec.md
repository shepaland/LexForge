# implementation-loop Specification

## Purpose
What happens inside a single plan task: what the TDD loop looks like, who looks at the
result before the checkbox closes, what goes into the reviewer's context, and what the
skill does when a task pulls in work that no delta requirement describes.

## Requirements

### Requirement: Tasks run one at a time in plan order

The skill `lexforge-apply` SHALL take tasks in order of number and SHALL NOT start the next
one until the current one is closed: test written, failure seen, implementation written,
run green, review passed, checkbox marked.

Merging tasks into one pass SHALL NOT be allowed. A task's small size, a shared file, and
matching wording between neighboring tasks are not grounds for merging them.

#### Scenario: Three small tasks in a row

- **WHEN** tasks 2.1, 2.2, and 2.3 touch one file and together add twenty lines
- **THEN** the skill goes through them one at a time and closes three checkboxes with three
  separate marks

#### Scenario: A task needs the result of a later one

- **WHEN** task 3.2 cannot be done without what task 3.5 produces
- **THEN** the skill stops and names the defect in the plan, instead of silently reordering
  the tasks

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

A finding at level MINOR SHALL either be fixed now or become a new task in `tasks.md` with
its own number and its own file. Findings SHALL NOT stay only in the agent's memory.

Disagreement with the reviewer SHALL be expressed with an argument backed by evidence —
code, a test, or a line from a requirement. Silent agreement and silent dismissal are
equally unacceptable.

#### Scenario: A MINOR finding set aside for later

- **WHEN** the reviewer finds a duplicated piece of code and calls it MINOR
- **THEN** the finding is either fixed or turned into a separate task in the plan

#### Scenario: The reviewer is wrong

- **WHEN** a CRITICAL finding rests on a misreading of a requirement
- **THEN** the skill quotes the requirement, shows the test, and explains why the finding is
  dismissed

### Requirement: The checkbox closes right away; the stamp is cleared at the task boundary

The mark `- [x]` SHALL go into `tasks.md` right after the run is green and review findings
are closed. Marking a batch of checkboxes at the end of the work SHALL NOT be allowed:
closed tasks and open ones stop being distinguishable.

At the task boundary, `lexforge evidence record --change <name> --label tests` SHALL run.
An exit code of `1` means a red run: the task stays open, and the work continues with
reading the failure.

#### Scenario: Five tasks, one checkbox

- **WHEN** five tasks are done and their marks are all set at once at the end
- **THEN** this is a violation: each mark is set at the moment its own task closes

#### Scenario: A red stamp

- **WHEN** `lexforge evidence record` returns `1`
- **THEN** the checkbox stays empty, and the next step is reading the failure

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
