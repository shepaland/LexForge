# skill-routing

## Purpose

How the agent enters the planning pipeline and how it moves from one skill to the next: the
frontmatter's form, how triggers are split across the five descriptions, the single entry
point through skill `lexforge`, request classification, and handing work onward.

## Requirements

### Requirement: Frontmatter has exactly two fields

Each skill's `SKILL.md` SHALL carry YAML frontmatter with exactly two fields: `name` and
`description`. No other fields: no version, no author, no tool list, no mark of what
generated the file.

The value of `name` SHALL match the name of the directory the file lives in, and consist of
lowercase Latin letters, digits, and hyphens.

#### Scenario: Extra field in frontmatter

- **WHEN** a third field shows up in a skill's frontmatter
- **THEN** the skill-structure check reports it and exits with a nonzero code

#### Scenario: Name doesn't match the directory

- **WHEN** the `name` field doesn't match the skill's directory name
- **THEN** the skill-structure check names both values and exits with a nonzero code

### Requirement: The description names the trigger moment

The `description` field SHALL be written in English, in the third person, start with the
words `Use when`, and name the conditions under which the skill fires: the change's state,
the kind of request, an observable sign.

The description SHALL NOT retell the skill's steps. Retelling gives the agent a ready
shortcut: it carries out the description and never opens the body.

#### Scenario: Description retells the steps

- **WHEN** the `description` lists the steps the skill carries out inside
- **THEN** this counts as a defect in the skill and is fixed before pressure scenarios are run

#### Scenario: Request in a different language

- **WHEN** the user writes the request in Russian while the skill's description is written in
  English
- **THEN** the skill fires: the request's language has no effect on triggering

### Requirement: The pipeline has a single entry point

Skill `lexforge` SHALL fire on a request to build, add, fix, or repair something in the
project. The other four planning skills SHALL fire on the state of a specific change, not on
the user's original request.

An agent that enters the pipeline mid-way stops under the queue rule. Splitting the
descriptions cuts the number of such entries, but does not replace the status check.

#### Scenario: Feature request

- **WHEN** the user asks to add a CSV report export to the project
- **THEN** skill `lexforge` fires, not an individual artifact skill

#### Scenario: Request for a specific artifact

- **WHEN** the user asks to write delta specs for a change that's already started
- **THEN** the artifact skill `specs` fires, and it starts with the status check

### Requirement: Classification is announced out loud and picks the schema

Skill `lexforge` SHALL tell the user the request's class before its first question: a spike,
a bounded change, or an architectural change.

The class SHALL determine the action: a spike starts no change and ends with an answer plus a
recommendation; a bounded change is started with `lexforge new change <name> --schema
bounded`; an architectural one with `lexforge new change <name> --schema spec-driven`.

When torn between two classes, the heavier one SHALL be taken. Downgrading the class mid-work
is forbidden.

#### Scenario: Class named before the questions

- **WHEN** the user asks to build something
- **THEN** the skill's first message names the request's class and lets the user correct it

#### Scenario: Torn between classes

- **WHEN** the request looks like both a bounded and an architectural change
- **THEN** the architectural class is taken, and the change is started on schema
  `spec-driven`

#### Scenario: Spike

- **WHEN** the user asks to find out whether an approach is possible and report back
- **THEN** no change is started, the skill answers and names a recommendation

### Requirement: Work is handed off through the next-step field

Every planning skill that finishes its artifact SHALL read the `nextStep` field of the
machine response from the last command it ran, and tell the user that command as the next
step.

The skill SHALL NOT make up the next step itself when the command already named it.

#### Scenario: Artifact written

- **WHEN** the skill finishes `proposal.md` and gets `nextStep` set to `lexforge instructions
  specs --change <name>` from `lexforge status --change <name> --json`
- **THEN** the skill names that command and hands the work to the artifact skill `specs`

#### Scenario: Planning finished

- **WHEN** `lexforge status --change <name> --json` returns `isPlanningComplete: true`
- **THEN** the skill shows the artifacts it wrote, names the move to implementation, and
  stops without starting implementation
