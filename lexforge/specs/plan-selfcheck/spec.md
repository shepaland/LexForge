# plan-selfcheck

## Purpose

Checking a plan before anyone starts writing code from it. A plan with a task that says "same
pattern from here on" looks finished and falls apart halfway through: the person doing the work
ends up inventing what the plan's author never worked out. This spec records what counts as an
unrecorded task, how a delta requirement links to a task, and why a machine catches the same
name spelled two different ways.

## Requirements

### Requirement: Placeholders are found from a marker list

The self-check SHALL scan the text of every task for markers of unrecorded work and report a
finding on each match.

The list SHALL carry markers in two languages, because artifacts are written in the project's
language: `TBD`, `TODO`, `FIXME`, `XXX`, `add error handling`, `similar to task`, `same as
above`, `and so on`, `as needed`, «уточнить», «дописать», «доделать», «по аналогии», «аналогично
задаче», «как в задаче», «остальное так же», «и так далее», «и т. д.», «и прочее»,
«при необходимости», «если понадобится», «добавить обработку ошибок», «разобраться».

The comparison SHALL be case-insensitive and treat «е» and «ё» as the same letter, with word
boundaries that understand Cyrillic: a marker inside a longer word does not count as a match.

#### Scenario: Russian phrasing

- **WHEN** a task contains the text «дальше по аналогии с задачей 3»
- **THEN** the check reports a finding with the line number and quotes the matched marker

#### Scenario: Marker in uppercase

- **WHEN** a task contains the word «УТОЧНИТЬ»
- **THEN** the match counts

#### Scenario: Marker inside another word

- **WHEN** a task contains the word «доделать» as part of the word «переделать»
- **THEN** there is no finding

### Requirement: A project extends the marker list but does not shrink it

The file `lexforge/config.yaml` SHALL accept a list of additional markers. Its values are added
to the built-in markers.

There SHALL be no way to remove a built-in marker or turn off the rule: the marker list grows
from findings on real plans, and reversing that opens the gate.

#### Scenario: Project added its own marker

- **WHEN** the project config records the marker «на усмотрение исполнителя», and a task
  contains that phrase
- **THEN** the check reports a finding

#### Scenario: Built-in markers still work

- **WHEN** a project has added its own marker list
- **THEN** the built-in markers keep working

### Requirement: Signs of an unrecorded task beyond the word list

The marker list does not cover a rephrased version of the same idea, so the self-check SHALL
also report a finding when:

- the task text points to another task by number (`задача 7`, `шаг 3`, `п. 4`, `Task 7`): the
  work is named by a pointer, not described;
- the task text is shorter than thirty characters: a task that short does not describe the work;
- the task text still carries template traces — a markup comment or an angle-bracket
  placeholder.

The rule about template traces SHALL apply the same check as strict-mode artifact validation: a
command inside backticks does not count as a placeholder.

#### Scenario: Task points to another task

- **WHEN** a task's text contains «повторить для остальных случаев, как в задаче 5»
- **THEN** the check reports a finding and names the task-reference rule

#### Scenario: Task too short

- **WHEN** a task's text is just the word «Тесты»
- **THEN** the check reports a finding and states the required length

#### Scenario: Command inside backticks

- **WHEN** a task contains `lexforge new change <name>` inside backticks
- **THEN** there is no placeholder finding

### Requirement: Every delta requirement is named by a task

A task MAY carry one or more references to a requirement in the form
`-> <capability-path>#<requirement name>`.

The self-check SHALL report a finding for every requirement in the change's delta specs that no
task references. The finding text names the capability and the requirement name.

A reference naming a requirement that does not exist in the delta SHALL become its own finding:
otherwise a typo in the name leaves the requirement uncovered while looking covered.

#### Scenario: Requirement with no tasks

- **WHEN** a delta carries three requirements, and the references in the tasks name only two
  of them
- **THEN** the check reports one finding naming the uncovered requirement

#### Scenario: Reference to a nonexistent requirement

- **WHEN** a task references a requirement that is not in any delta spec of the change
- **THEN** the check reports a finding with the task's line number and lists the requirement
  names of that capability

#### Scenario: Change with a skipped delta

- **WHEN** checking a change whose delta-spec artifact is declared skipped
- **THEN** the coverage rule gives no findings

### Requirement: One identifier is named one way

The self-check SHALL collect the names recorded in backticks across the tasks, reduce each to a
comparison key (lowercase, hyphens and underscores stripped), and report a finding when one key
matches two or more different spellings.

The finding text SHALL name both spellings and the line numbers where they appear.

Entries that contain a space SHALL NOT take part in the comparison: `lexforge check plan` is a
command call, and its key matching a function name is not a finding.

#### Scenario: Same name, different spelling

- **WHEN** task 3 names the field `resolvedOutputPath`, and task 7 names `resolved_output_path`
- **THEN** the check reports a finding with both spellings and both line numbers

#### Scenario: Different names with close spelling

- **WHEN** tasks name the files `run.ts` and `run.test.ts`
- **THEN** there is no finding

#### Scenario: Command and function

- **WHEN** tasks contain `lexforge check plan` and `checkPlan`
- **THEN** there is no finding

### Requirement: A self-check finding names the location

Every finding SHALL carry a relative path to the plan file, the task's line number, a rule id,
and text explaining what to rewrite.

Findings SHALL print grouped by file, in ascending line-number order.

#### Scenario: Several findings in one plan

- **WHEN** a plan has three violations across different tasks
- **THEN** the findings print in ascending line-number order, each with its own rule

#### Scenario: No plan

- **WHEN** the self-check is called on a change with no `tasks.md` written
- **THEN** the command exits with code `2` and names the command for getting plan instructions

### Requirement: A section records what it depends on

Every numbered section of `tasks.md` SHALL carry a `Depends on:` line naming the sections that
have to be closed before it starts, or the word `none`.

`lexforge check plan --change <name>` SHALL report a finding on a section carrying no such line,
and the finding SHALL name the section's number. A plan with such a finding SHALL end the
command with exit code `1`.

Two sections SHALL count as concurrent when neither names the other in its `Depends on:` line,
directly or through the sections that line leads to. Two concurrent sections whose tasks name
the same file SHALL be a finding: both become ready at the same moment, both are dispatched, and
each agent loses the other's work. Naming one and the same dependency is no protection - two
sections that both wait for section 2 are released together the instant it closes.

A `Depends on:` line naming a section that is not in the plan SHALL be a finding, and so SHALL a
cycle: two sections that wait for each other are never ready.

#### Scenario: A section says nothing

- **WHEN** section 3 carries no `Depends on:` line
- **THEN** the command ends with exit code `1` and names section 3

#### Scenario: Two independent sections on one file

- **WHEN** sections 5 and 6 both say `Depends on: none` and tasks in both name
  `src/core/run.ts`
- **THEN** the command ends with exit code `1` and names both sections and the file

#### Scenario: One dependency shared by two sections

- **WHEN** sections 3 and 4 both say `Depends on: section 2` and tasks in both name
  `src/cli/commands/defect.ts`
- **THEN** the command ends with exit code `1` and names both sections and the file, because
  closing section 2 releases them together

#### Scenario: A shared file on a chain

- **WHEN** section 4 says `Depends on: section 3`, section 3 says `Depends on: section 2`, and
  tasks in sections 2 and 4 name one file
- **THEN** the dimension adds no finding: section 4 cannot start until section 2 is closed

#### Scenario: A dependency that does not exist

- **WHEN** section 4 says `Depends on: section 9` and the plan has six sections
- **THEN** the command ends with exit code `1` and names section 4 and the missing section

#### Scenario: A cycle

- **WHEN** section 3 says `Depends on: section 5` and section 5 says `Depends on: section 3`
- **THEN** the command ends with exit code `1` and names both sections

#### Scenario: A plan that answers

- **WHEN** every section carries the line, no cycle exists, and no two concurrent sections share
  a file
- **THEN** the dimension adds no finding
