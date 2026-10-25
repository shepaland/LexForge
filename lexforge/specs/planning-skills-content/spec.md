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
`- [ ] 1.1`, where each task carries `Files:` with the files it touches, `Test:` with its test
files and `Command:` with the command that confirms the result.

Every delta-spec requirement SHALL be covered by at least one task.

A task with code SHALL be one task that holds the whole TDD step: its test is committed first
and seen to fail by `lexforge task red`, then the implementation is committed and seen to pass
by `lexforge task green`. Writing the test, running it and writing the implementation SHALL NOT
be split into three tasks.

Lines like `TBD`, `TODO`, "same as task N," and "add error handling" with no named place
SHALL NOT stay in the plan.

#### Scenario: Requirement without a task

- **WHEN** a delta spec has a requirement that no task refers to
- **THEN** the skill writes a task and names the requirement it covers

#### Scenario: Task with code

- **WHEN** a task adds a function
- **THEN** the plan carries one task whose `Test:` names the failing test, whose `Files:` names
  the test and the implementation, and whose `Command:` runs the test

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

### Requirement: A task with no green midpoint is cut into steps, not given a bigger budget

Skill `lexforge-plan` SHALL size a task so that one executor finishes it, from the red run to
the green run, and the suite is green when the task closes.

A task whose work has no point partway through it where the suite is green SHALL NOT be
written as one task: the skill SHALL cut it into tasks, each of which leaves the suite green
when it closes.

Where the work replaces a structure already in use, those tasks SHALL keep the old structure
and the new one side by side until the last task: the new path is added first, callers move
to it one at a time in the tasks that follow, and the old path is removed only in the final
task.

A task naming work with no such midpoint SHALL be treated as a plan defect, not as a task
that needs a larger budget: enlarging the dispatched agent's budget SHALL NOT be offered as
the fix. During implementation the plan is cut through `lexforge plan amend`.

#### Scenario: A task that replaces a structure in use

- **WHEN** a task would replace four states and three handlers of a dialogue with one FSM
  state, and no point of that rewrite leaves the suite green until every one of the old
  states and handlers is gone
- **THEN** the skill cuts it into tasks that add the new handler beside the old ladder, move
  one required question onto it at a time, check every required question routes through it,
  and remove the old states and handlers only in the last task

#### Scenario: Three agents over budget on the same task

- **WHEN** three executors in a row exceed the token budget on the task that reads
  "collapse the dialogue into one FSM state", and the task still has no point where the suite
  is green partway through it
- **THEN** the plan cuts that task into tasks through `lexforge plan amend` instead, and a
  larger budget is not offered as the fix

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

Skill `lexforge-plan` SHALL write `(move)` right after the id of a task whose whole work is
carrying existing code from one file to another without changing behaviour, and SHALL write no
such declaration on any other task.

A move has no run to watch fail, so it carries no `Test:` and takes no red run: a failing test
would be a test of behaviour nobody is changing, and its `Command:` is a regression run that
passes at `task green`. The declaration is what `task red` and `task green` read, so a move left
undeclared stops at `task red`, and a task declared a move that does change behaviour passes
without the red run it should have had.

#### Scenario: A section that splits a file

- **WHEN** the skill plans a section that carries four functions out of one file into a new
  one, changing no behaviour
- **THEN** each of those tasks carries `(move)` right after its id, and none of them carries a
  `Test:` line

#### Scenario: A task that changes behaviour

- **WHEN** a task adds a branch, a field or a rule, however small
- **THEN** the skill writes no `(move)` on it and writes it as one task with `Test:` and
  `Command:`

### Requirement: The specs skill agrees mockups and classes with the user

For a requirement that changes a screen, `lexforge-spec` SHALL offer the user two routes,
a visual editor producing an HTML file with a separate CSS file, or an ASCII mockup, and
SHALL wait for the choice.

When the change holds an HTML mockup and `ui.styles` is absent, the skill SHALL ask the user
where the project CSS lies. When the user does not know or asks for a search, the skill
SHALL run `lexforge styles find`, show the list, let the user exclude or add files, and
save the result with `lexforge styles set`.

Before a class enters the class list as `new` or `changed`, the skill SHALL ask the user and
SHALL write the line only after a yes.

For a requirement with two or more participants, the skill SHALL write the `Interaction:`
line, the diagram and the contract table.

#### Scenario: A new class the user has not seen

- **WHEN** the mockup needs a class the project CSS does not declare
- **THEN** the skill names the class and its purpose to the user and waits, and the class
  list stays unchanged until the answer

#### Scenario: The user does not know the CSS path

- **WHEN** the user answers "I don't know" to the question about the project CSS
- **THEN** the skill runs `lexforge styles find` and shows the list before writing the
  config

### Requirement: The specs skill settles the data stores with the owner

Before writing a data requirement in a project without `data_stores`, `lexforge-spec` SHALL
look for evidence of databases in the repository: images in compose files, driver dependencies,
ORM providers, connection strings in example configs and migration folders. It SHALL show the
owner each store it found with its dialect and the file and line it came from, and SHALL wait
for confirmation. With no evidence it SHALL ask the owner for the stores and their dialects. It
SHALL save each confirmed store with `lexforge stores add` and SHALL NOT write `data_stores`
into `lexforge/config.yaml` by hand.

#### Scenario: A compose file with Postgres

- **WHEN** `docker-compose.yml` runs the image `postgres:16` and `package.json` depends on `pg`
- **THEN** the skill names `postgresql` with both files, waits for the owner, and runs
  `lexforge stores add` only after the answer

#### Scenario: A new project with no evidence

- **WHEN** the repository holds no compose file, driver or migration folder
- **THEN** the skill asks the owner which stores the project uses and with which dialect

### Requirement: The specs skill marks every requirement that changes a store

For a requirement that creates, changes or removes a table, a field, a key or an index, or moves
stored data, `lexforge-spec` SHALL write the `Data:` line naming the affected stores and SHALL
write the schema and the migration of each store before running `validate`.

#### Scenario: Adding a table

- **WHEN** the owner asks for a returns table in the orders service of a Postgres project
- **THEN** the requirement carries `Data: main` and the change holds `data/main/schema.sql`,
  `up.sql` and `down.sql`

### Requirement: The specs skill asks the three service questions one at a time

For a requirement that introduces a service, `lexforge-spec` SHALL ask the owner the three
classification questions one per message, in order, and SHALL wait for each answer. It SHALL
NOT answer a question for the owner. On "I don't know" it SHALL work through the question with
the owner until the answer is yes or no. It SHALL write the `Service:` line and `service.md`
with the answers, the type that follows, and the sections of that type.

#### Scenario: A new notification service

- **WHEN** the owner asks for a new notification service
- **THEN** the skill sends the first question alone and waits before sending the second

#### Scenario: The owner does not know

- **WHEN** the owner answers "I don't know" to whether another instance must resume interrupted
  work
- **THEN** the skill asks what happens to an unfinished send when an instance stops, and writes
  no answer until the owner says yes or no

### Requirement: The plan skill sends the plan to four reviewers

The skill `lexforge-plan` SHALL, once `lexforge check plan` passes, send the plan to four fresh
reviewers on the model of the `tasks` stage, one per angle: `specs`, `code`, `dependencies` and
`gaps`, with the prompt `skills/lexforge-plan/plan-reviewer-prompt.md`. Each report SHALL be
registered with `lexforge plan review --angle <angle> --file <report.md>`. Critical and important
findings SHALL be fixed in the plan, and the changed plan SHALL be reviewed again, before the
owner is asked for approval.

#### Scenario: Approval asked after two angles

- **WHEN** the `specs` and `code` reviews approved and the agent is about to ask the owner
- **THEN** the skill sends the `dependencies` and `gaps` reviews first, because `plan approve`
  refuses with `plan-reviews-missing`

### Requirement: The plan skill shows the owner a summary of decisions and the plan link

After four approving reviews the skill SHALL show the owner a summary laid out by
`skills/lexforge-plan/digest.md`: the agent's own decisions first, those that change visible
behaviour at the top, then the verdicts of the four angles with the number of findings closed,
then the link to `tasks.md`. The owner's answer SHALL be recorded with
`lexforge plan approve --quote` in the owner's words.

#### Scenario: A decision the agent took alone

- **WHEN** the agent chose the date format itself while writing the plan
- **THEN** the summary names that decision before the review verdicts

