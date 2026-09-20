# planning-skills-content

## Purpose

What each of the five planning skills does: required steps, the boundary of planning, the
form of behavior rules inside `SKILL.md`, and the bans that code cannot check.

## Requirements

### Requirement: Planning does not write project code

Skills `lexforge`, `lexforge-propose`, `lexforge-spec`, `lexforge-design`, and `lexforge-plan`
SHALL create and edit files only inside the change directory and the `lexforge/config.yaml`
file.

A build request SHALL allow planning and SHALL NOT allow implementation, even when it uses
the word "build," "implement," or "fix." Implementation starts with a separate user request
after the artifacts are shown.

The rule SHALL be written into each of the five skills, not in one shared place: a skill is
read on its own, apart from the others.

#### Scenario: The request says "build it"

- **WHEN** the user asks to build a CSV export
- **THEN** the skill starts a change and writes artifacts; not one project source file is
  created or edited

#### Scenario: A two-line edit

- **WHEN** partway through planning it becomes clear the change fits in two lines of code
- **THEN** the skill still does not touch the code: it shows the artifacts and stops

#### Scenario: User asks for the code right away

- **WHEN** partway through planning the user asks to just write the implementation
- **THEN** the skill names which artifacts are unfinished and offers to finish planning first

### Requirement: The entry skill starts the change

Skill `lexforge` SHALL carry out four steps and report their result to the user: state the
request's class, confirm the workspace exists, propose a change name in kebab-case, and run
`lexforge new change <name> --schema <schema>`.

The change name SHALL be proposed to the user before the command runs. A command failure with
exit code `2` because the name is taken SHALL lead to proposing a new name, not to writing
into the existing directory.

#### Scenario: Name is taken

- **WHEN** `lexforge new change add-auth` returns exit code `2` because the directory already
  exists
- **THEN** the skill shows the existing change's state and asks whether to continue it or
  pick another name

#### Scenario: Name is not kebab-case

- **WHEN** the user proposes the name `Add Auth`
- **THEN** the skill names the corrected spelling `add-auth` and starts the change under it

### Requirement: The proposal skill asks questions before writing the file

Skill `lexforge-propose` SHALL do this in order: ask the user questions one at a time,
waiting for an answer to each; propose two or three approaches, each with a named trade-off,
plus one recommendation; get the user's choice; and only then write `proposal.md`.

Questions SHALL be asked one per message. A list of five questions at once is forbidden.

The skill SHALL NOT write the `Why` section straight from the user's first message: an
unchecked understanding of the task, once it lands in an artifact, carries forward into the
specs and the plan.

#### Scenario: Questions one at a time

- **WHEN** three things are still unclear after the user's request
- **THEN** the skill asks the first question, waits for an answer, asks the second, and so on
  to the end

#### Scenario: Approaches with a recommendation

- **WHEN** the goal of the change is clear
- **THEN** the skill names two or three approaches, each with a trade-off, and gives one
  recommendation with a reason

#### Scenario: The request looks clear

- **WHEN** the user's request seems fully clear to the skill
- **THEN** the skill still asks at least one question about the success criterion before
  writing the file

### Requirement: The specs skill does not invent requirements

Skill `lexforge-spec` SHALL write one `specs/<capability-path>/spec.md` file per capability,
name requirements as `### Requirement:` with the word SHALL in the text, and give each
requirement at least one `#### Scenario:` with a `**WHEN**` line and a `**THEN**` line.

The skill SHALL bring `lexforge validate <name> --strict` to exit code `0`.

A requirement that is not in the proposal or in the user's answers SHALL NOT be written just
to pass the check. A change with no behavior change is closed by declaring
`skip_specs: true` in `.lexforge.yaml`.

#### Scenario: Zero-delta finding

- **WHEN** `validate` returns a finding with rule `empty-delta`
- **THEN** the skill asks the user whether the change alters product behavior, and depending
  on the answer either writes real requirements or declares `skip_specs: true`

#### Scenario: The temptation to add a requirement

- **WHEN** the check fails, and adding one plausible-looking requirement looks like the fast
  fix
- **THEN** the skill does not do this, and goes back to the user with a question

#### Scenario: Requirement without a scenario

- **WHEN** `validate` returns a finding with rule `requirement-without-scenario`
- **THEN** the skill writes a scenario for that requirement and reruns the check

### Requirement: The design skill agrees the document section by section

Skill `lexforge-design` SHALL show `design.md` to the user one section at a time, ask after
each one whether it's right, and move to the next section only after getting an answer.

Each decision SHALL carry three parts: the choice, the reason, and a rejected alternative
with the reason it was rejected.

The skill SHALL NOT lay out the whole finished document at once and ask about it with a
single question.

#### Scenario: Agreeing a section

- **WHEN** the skill writes the `Decisions` section
- **THEN** it shows the decisions and waits for the user's answer before moving to the
  `Risks / Trade-offs` section

#### Scenario: Decision without an alternative

- **WHEN** a decision has no rejected alternative
- **THEN** the skill either names an alternative and the reason it was rejected, or admits
  there was no real choice and explains why

### Requirement: The plan skill leaves no placeholders

Skill `lexforge-plan` SHALL write `tasks.md` as numbered sections and tasks in the form
`- [ ] 1.1`, where each task names the file it touches and the check that confirms the
result.

Every delta-spec requirement SHALL be covered by at least one task.

Tasks with code SHALL be laid out by TDD: first a failing test, then a separate step that
runs it and shows the failure, then the implementation.

Lines like `TBD`, `TODO`, "same as task N," and "add error handling" with no named place
SHALL NOT stay in the plan.

#### Scenario: Requirement without a task

- **WHEN** a delta spec has a requirement that no task refers to
- **THEN** the skill writes a task and names the requirement it covers

#### Scenario: Task with code

- **WHEN** a task adds a function
- **THEN** the plan carries three steps: write a failing test, run it and see it fail, write
  the implementation

#### Scenario: A spot where it's unclear how to do it

- **WHEN** a step in the plan turns out unclear to its author
- **THEN** the skill asks the user and does not write `TBD`

### Requirement: The form of behavior rules follows the proven pattern

Every skill an agent could work around under pressure SHALL carry four parts: the rule in one
line in capital letters, a line stating that breaking the letter of the rule breaks its
spirit, a table of "excuse — what's actually true," and a list of signs that mean stop.

Rows in the excuse table SHALL be taken verbatim from pressure-scenario runs. A made-up
excuse does not go into the table: it takes up space while closing a loophole that doesn't
exist.

A rule the agent does not break but carries out in the wrong form SHALL be closed by
describing the required form of the result, not by a ban.

#### Scenario: New excuse

- **WHEN** a scenario run produces a rationalization that isn't in the table
- **THEN** its exact wording is added to the table, and the scenario is run again

#### Scenario: Result of the wrong form

- **WHEN** the agent follows the rule but writes the artifact in the wrong form
- **THEN** a description of the required form is added to the skill, not another ban

### Requirement: The five planning skills carry the model gate

The shared queue-rule block of `lexforge`, `lexforge-propose`, `lexforge-spec`,
`lexforge-design` and `lexforge-plan` SHALL carry the model gate: compare the model at work
against the model from the instructions response, hand the artifact to a subagent on the
assigned model when they differ, and write nothing when that model cannot be reached.

Each of the five SHALL carry a pressure scenario in which the agent is pushed to write the
artifact itself, and the run SHALL show the agent handing the work over instead.

#### Scenario: The block of every planning skill

- **WHEN** the five planning skills are checked against the shared block
- **THEN** each of them carries the model gate in the same words

#### Scenario: A pressure run on the gate

- **WHEN** the pressure scenario runs on a subagent that is not the assigned model and is
  told the handover costs too much time
- **THEN** the run ends with no artifact written by that subagent and with the handover made

### Requirement: The plan skill labels every task with the agent group it belongs to

Skill `lexforge-plan` SHALL write a group label in square brackets right after every task's
id, in the form `- [ ] 3.1 [A] Write the failing prose test in ...`. A label SHALL be a short
token of letters, digits and hyphens, at most eight characters long; a longer bracketed word,
or one holding a space, is ordinary task text, not a label.

Tasks that may run in one agent SHALL share a label. A section one agent takes whole SHALL
carry one label across every one of its tasks. A task SHALL carry exactly one label: a second
label on the same task is a defect of the plan, not a way to put that task in two groups.

The skill SHALL place tasks into groups so that no two groups of one section name the same
file in backticks, and so that each group is work that fits inside the token budget of one
agent.

#### Scenario: A section split across two agents

- **WHEN** section 4 holds eight tasks and the skill decides two agents can carry it at once
- **THEN** every task the first agent takes carries one label, every task the second agent
  takes carries a different label, and no task naming a file the other group's tasks also
  name lands in either group

#### Scenario: A section one agent takes whole

- **WHEN** the skill decides a section is small enough for a single agent
- **THEN** every task of that section carries the same label

#### Scenario: A task whose text opens with a bracketed word

- **WHEN** task 4.5's text opens with `[reference]`, a bracketed word nine letters long, as
  ordinary prose, not as the label the skill would write
- **THEN** the skill leaves `[reference]` inside task 4.5's text, because a bracketed word
  over eight characters is not a label, and writes that task's own short label after its id
  the same as every other task

#### Scenario: A group too large for one agent

- **WHEN** the tasks the skill would put in one group do not fit inside the token budget of
  one agent
- **THEN** the skill splits that work into more groups, each with its own label, before
  handing the plan to `lexforge check plan --change <name>`

### Requirement: A task with no green midpoint is cut into steps, not given a bigger budget

Skill `lexforge-plan` SHALL size a task so that one cycle finishes it and the suite is green
when the cycle ends.

A task whose work has no point partway through it where the suite is green SHALL NOT be
written as one task: the skill SHALL cut it into steps, each of which leaves the suite green
when it ends.

Where the work replaces a structure already in use, those steps SHALL keep the old structure
and the new one side by side until the last step: the new path is added first, callers move
to it one at a time in the steps that follow, and the old path is removed only in the final
step.

A task naming work with no such midpoint SHALL be treated as a plan defect, not as a task
that needs a larger budget: enlarging the dispatched agent's budget SHALL NOT be offered as
the fix.

#### Scenario: A task that replaces a structure in use

- **WHEN** a task would replace four states and three handlers of a dialogue with one FSM
  state, and no point of that rewrite leaves the suite green until every one of the old
  states and handlers is gone
- **THEN** the skill cuts it into steps that add the new handler beside the old ladder, move
  one required question onto it at a time, check every required question routes through it,
  and remove the old states and handlers only in the last step

#### Scenario: Three agents over budget on the same task

- **WHEN** three dispatched agents in a row exceed the token budget on the task that reads
  "collapse the dialogue into one FSM state", and the task still has no point where the suite
  is green partway through it
- **THEN** the plan cuts that task into steps instead, and a larger budget is not offered as
  the fix

### Requirement: The plan is an index, and carries no task of its own

Skill `lexforge-plan` SHALL write `tasks.md` as an index: one entry per section, each
carrying that section's heading and a link to the file that holds the section's tasks.
`tasks.md` SHALL carry no `Depends on:` line and no task line of its own.

#### Scenario: A plan the skill writes

- **WHEN** the skill finishes writing a plan of four sections
- **THEN** `tasks.md` carries four headings, each with a link to that section's own file,
  and no task line and no `Depends on:` line appear anywhere in `tasks.md` itself

### Requirement: Each section lives in a file of its own, one path segment below the index

Skill `lexforge-plan` SHALL write each section's `Depends on:` line and its tasks into a
file of its own, one path segment below `tasks.md`, and SHALL link that file from the
section's entry in the index.

#### Scenario: A section's own file

- **WHEN** the skill writes section 4
- **THEN** a file one path segment below `tasks.md` carries section 4's `Depends on:` line
  and every one of section 4's tasks, and the index links to that file from section 4's
  entry

### Requirement: A task that only carries code between files declares itself a move

Skill `lexforge-plan` SHALL write `(move)` after the group label of a task whose whole work
is carrying existing code from one file to another without changing behaviour, and SHALL
write no such declaration on any other task.

A move has no run to watch fail, so the three-task triple does not apply to it: the failing
test a triple starts with would be a test of behaviour nobody is changing. The declaration is
what the completion check reads, so a move left undeclared stops the change at `verify`, and a
task declared a move that does change behaviour passes a check it should have failed.

#### Scenario: A section that splits a file

- **WHEN** the skill plans a section that carries four functions out of one file into a new
  one, changing no behaviour
- **THEN** each of those tasks carries `(move)` after its group label, and none of them is
  written as a test, a run and an implementation

#### Scenario: A task that changes behaviour

- **WHEN** a task adds a branch, a field or a rule, however small
- **THEN** the skill writes no `(move)` on it and writes it as a test, a run and an
  implementation

### Requirement: The plan skill asks the user for the path before writing the plan

Before it writes `tasks.md`, the skill `lexforge-plan` SHALL count the lines of every
existing covered file its tasks will name.

When any of them is over the line limit, the skill SHALL show the user each such file with
its line count, SHALL ask which path the change takes, `refactor` or `keep`, and SHALL
record the user's answer as `long_files` in the change's `.lexforge.yaml` before it writes
`tasks.md`.

The skill SHALL NOT choose the path itself, and SHALL NOT write `tasks.md` before the user
has answered.

When none of the files is over the limit, the skill SHALL NOT ask.

#### Scenario: A long file stops the plan until the user chooses

- **WHEN** the plan for `add-refunds` will name `src/billing.ts`, 612 lines, and the limit is
  400
- **THEN** the skill shows `src/billing.ts` with 612 lines, asks for `refactor` or `keep`,
  writes the answer to `.lexforge.yaml`, and only then writes `tasks.md`

#### Scenario: No long file, no question

- **WHEN** every existing covered file the plan will name is within the limit
- **THEN** the skill writes `tasks.md` without asking about a path

### Requirement: On the refactor path the splitting comes first

On the `refactor` path, the skill `lexforge-plan` SHALL split each long file the plan names
in a task declared `(move)`, and that task SHALL come before any other task naming the same
file.

#### Scenario: The split precedes the feature work

- **WHEN** the change is on the `refactor` path and the plan names `src/billing.ts`, 612
  lines
- **THEN** the first task naming `src/billing.ts` is a `(move)` task that splits it, and the
  task adding refunds to billing comes after it
