# implementation-skills

## Purpose

Where the four implementation skills live, how their shared queue-rule block differs from
the planning skills' block, what the word limit on the body is, and what each file gets
checked against. This is for whoever adds a ninth skill or edits the shared block.

## Requirements

### Requirement: Four implementation skills sit in directories next to the planning skills

The stage's skills SHALL be named `lexforge-apply`, `lexforge-verify`, `lexforge-archive`,
and `lexforge-debug`, and SHALL live at `skills/<skill name>/SKILL.md` in the root of the
LexForge repository.

Each file SHALL carry frontmatter with exactly the fields `name` and `description`, where
`name` matches the directory name and `description` starts with the words `Use when` and
names the trigger moment.

The body SHALL be written in English: the agent decides whether to invoke a skill from its
description, and an English trigger fires on requests in any language.

#### Scenario: Skill directory after the stage

- **WHEN** the stage is done and the `skills/` directory is read
- **THEN** it holds nine directories: five planning skills and four implementation skills

#### Scenario: A third field in the frontmatter

- **WHEN** a `SKILL.md` gains a field beyond `name` and `description`
- **THEN** the structure test fails and names the file and the extra field

### Requirement: Implementation skills carry their own shared queue-rule block

The shared block SHALL sit between the markers `<!-- queue-rule:start -->` and
`<!-- queue-rule:end -->` and SHALL match character for character across the three skills
that work on a change: `lexforge-apply`, `lexforge-verify`, `lexforge-archive`.

The skill `lexforge-debug` SHALL carry no such block. It fires on any bug, including in a
project that has no LexForge workspace at all, and the block would stop the work with the
error code `workspace-not-found`.

The implementation skills' block SHALL differ from the planning skills' block: the first
checks that planning is complete, the second checks that a single artifact is ready. The
test SHALL compare blocks within each group separately and SHALL NOT require the two groups
to match each other.

#### Scenario: The block has drifted in one file

- **WHEN** the queue-rule block is edited in two of the three implementation skills
- **THEN** the test fails and names the file left with the old text

#### Scenario: Two groups of blocks

- **WHEN** the test compares the shared blocks of all nine skills
- **THEN** it expects two distinct texts — one for the five planning skills, one for the
  three implementation skills — and finds no block at all for the debug skill

### Requirement: The implementation queue-rule block checks that planning is complete

The first action of an implementation skill SHALL be `lexforge status --change <name>
--json`. Before it, not one line of project code is written and not one substantive
question about the task is asked.

The field `isPlanningComplete` with value `false` SHALL stop the skill. The skill names the
first artifact whose status is neither `done` nor `skipped`, and the command for getting
instructions for it.

A branch that warns and keeps working SHALL NOT exist. A deadline, the size of the change,
a direct user request to skip the step, and hours already spent do not open the gate.

#### Scenario: No plan written

- **WHEN** an implementation skill is invoked on a change whose `tasks.md` is empty
- **THEN** the skill names the artifact `tasks`, the command
  `lexforge instructions tasks --change <name>`, and stops without opening a single code
  file

#### Scenario: An artifact skipped through configuration

- **WHEN** the artifact `specs` is skipped through `skip_specs: true`, and the rest are
  written
- **THEN** `isPlanningComplete` is `true`, and the skill works

#### Scenario: The user asks to start without a plan

- **WHEN** the user writes that no plan is needed because the change is ten lines
- **THEN** the skill repeats the artifact's status and stops

### Requirement: A skill's body stays within its own word limit

The body of `SKILL.md` SHALL stay within the word limit set for that skill — 800 words for
`lexforge-apply`, 650 words for every other skill — counting everything outside the markers
of the shared block. The shared block SHALL NOT count toward this: it repeats verbatim, and
editing it would otherwise cut the budget of four files at once.

Material that outgrows the limit SHALL move to a separate file next to `SKILL.md` and get
linked one level deep. Links two levels deep SHALL NOT exist.

#### Scenario: The body has outgrown the limit

- **WHEN** `lexforge-verify`'s own text reaches 700 words
- **THEN** the test fails, names the file and its length, and the heavy part moves to a
  file alongside it

#### Scenario: A template for a reviewer request

- **WHEN** a skill needs a long template for a subagent's assignment
- **THEN** the template lives in a separate file next to `SKILL.md`, and the body carries a
  link to it

### Requirement: Each implementation skill carries two pressure scenarios

Each skill SHALL have at least two files at `tests/scenarios/<skill name>/<case name>.md`,
and each one SHALL pass a repeat run on a subagent.

The skill SHALL be written after running the scenario without it and recording the
rationalizations the subagent used to justify the violation. The rows of the excuse table
are taken verbatim from those runs.

The stage SHALL NOT be considered closed while even one scenario has not passed.

#### Scenario: A skill with one scenario

- **WHEN** the skill `lexforge-debug` has one scenario file
- **THEN** the stage does not close until a second one is written and passed

#### Scenario: Report on the runs

- **WHEN** the stage is declared finished
- **THEN** the report names each skill's scenarios and the outcome of each one's last run

### Requirement: Implementation skills install and get checked together with the planning skills

`lexforge init --tools <list>` SHALL lay out all nine skill directories in the directory of
each named tool.

The command test SHALL keep comparing every occurrence of `lexforge <command>` in skill
bodies against the list of commands registered in `src/cli/run.ts`. The commands `verify`
and `archive` pass the check, because by this stage they are registered.

#### Scenario: Install into an empty project

- **WHEN** the command `lexforge init --tools claude` runs in an empty project
- **THEN** nine skill directories appear in `.claude/skills/`, each with its own `SKILL.md`

#### Scenario: A command from a future stage

- **WHEN** an implementation skill's body gains a line with a command the CLI does not have
- **THEN** the test fails and names the command and the file

### Requirement: The four implementation skills carry the model gate

The shared queue-rule block of `lexforge-apply`, `lexforge-verify` and `lexforge-archive`
SHALL carry the same model gate as the planning skills.

`lexforge-debug` fires on a bug in a project that has no LexForge workspace at all, so it
SHALL carry a block of its own holding the model gate and nothing else: no workspace, no
change and no assignment leave it working as it works today.

`lexforge-apply`, `lexforge-debug` and `lexforge-verify` SHALL resolve to the model of the
calling runtime, and `lexforge-archive` SHALL demand no model, because archival demands none.

#### Scenario: The implementation loop

- **WHEN** `lexforge-apply` starts in a project whose entry for the calling runtime names a
  model other than the one at work
- **THEN** it hands the work to a subagent on that model and writes no code itself

#### Scenario: Debugging inside the loop

- **WHEN** `lexforge-debug` starts while `lexforge-apply` is running on the model of the
  calling runtime
- **THEN** both resolve to the same model and no handover happens between them

#### Scenario: Debugging outside a workspace

- **WHEN** `lexforge-debug` starts on a bug in a project that has no LexForge workspace
- **THEN** it works on the model its own block names for the provider at work

#### Scenario: Archival on any model

- **WHEN** `lexforge-archive` starts in the same project
- **THEN** it demands no model and merges the delta on whichever model is at work

### Requirement: Skills distinguish installation from migration authorization

The apply, verify, and archive skills SHALL state that installing LexForge 6.0.0 does not
migrate an existing change by itself. When a command refuses with `change-needs-migration`, the
skills SHALL run `lexforge migrate --change <name>`, report the historical and open tasks and
`missingFields` it returns, and send the open part of the plan through plan review and owner
approval. They SHALL NOT stop active agents, publish a package, or update a global installation
unless the corresponding action is separately in scope.

#### Scenario: Upgrade without migration request

- **WHEN** a project installs LexForge 6.0.0 and resumes a 5.x change
- **THEN** the first command refuses with `change-needs-migration`, and the skill runs
  `lexforge migrate` before any task command

#### Scenario: Incomplete history

- **WHEN** migration reports open tasks in `missingFields`
- **THEN** the skill names those tasks, adds the missing fields in `tasks.md` and sends the open
  part to plan review, without ticking those tasks or skipping approval

### Requirement: The reviewer brief carries the selected engineering rules

The reviewer brief in `skills/lexforge-apply/reviewer-prompt.md` SHALL have a slot
`[ENGINEERING_RULES]`, filled from the `## Engineering rules` section of the task brief that
`lexforge task start` selects over the files of the task. A finding on an engineering rule SHALL
name the rule ID, the file and the line, and the failure the sign points to. Such a finding SHALL
block the task: `task close` refuses with `findings-open` until a fix closes it. There SHALL be
no warning level for an engineering rule.

Interaction: dispatcher -> cli, cli -> dispatcher, dispatcher -> reviewer, reviewer -> dispatcher

```sequence
dispatcher -> cli: select
cli -> dispatcher: selection
dispatcher -> reviewer: review_brief
reviewer -> dispatcher: review_report
```

| Message | From | To | Field | Type | Required | Length | Response | Errors |
|---|---|---|---|---|---|---|---|---|
| select | dispatcher | cli | files | array | yes | 1..200 | selection | files-too-many, rules-too-many |
| selection | cli | dispatcher | rules | array | yes | <=60 | - | - |
| review_brief | dispatcher | reviewer | engineering_rules | array | yes | <=60 | review_report | - |
| review_report | reviewer | dispatcher | rule_id | string | no | 1..16 | - | - |

#### Scenario: A rule broken in the cycle

- **WHEN** the task's diff builds an SQL query by string concatenation and the brief carries
  `BE-02`
- **THEN** the reviewer reports a finding naming `BE-02`, the file and the line, and the task is
  not closed

#### Scenario: A switched-off rule

- **WHEN** `BE-02` is switched off in `lexforge/config.yaml`
- **THEN** the brief does not carry `BE-02` and the reviewer reports no finding on it

### Requirement: The executor gets the rules before it writes code

The brief that `lexforge task start` writes for a task SHALL include, in its
`## Engineering rules` section, the engineering rules selected for the files the task names,
without the rules whose audience is `reviewer`.

#### Scenario: Context for a backend task

- **WHEN** a task names `api/orders.py` in a project with `engineering.stacks: [python]`
- **THEN** the brief of `task start` holds the matching `BE` and `PY` rules and no `RV` rule
