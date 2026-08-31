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
