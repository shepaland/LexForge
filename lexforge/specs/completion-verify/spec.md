# completion-verify Specification

## Purpose
The machine part of the check before work is declared done. An agent who has reached the end of
the task list judges its own work, and judges it generously: an open checkbox gets explained
away as a minor thing, a requirement with no implementation gets explained as "covered by the
neighboring one." This spec records what `verify` measures on its own, what counts as proof a
requirement left a trace in the code, and where the line sits that a machine does not cross.

## Requirements

### Requirement: Three dimensions in one response

`lexforge verify --change <name>` SHALL check three things in a single call and fold the
findings into one list:

- open checkboxes in `tasks.md`;
- delta-spec requirements with no trace in the code;
- stamp state for every label in the `verification` section.

The dimensions SHALL NOT be toggled off by flags and SHALL NOT be called separately: the check
before completion runs as a whole, or the agent picks the one dimension that passes.

Every finding SHALL carry a rule id that shows which dimension it came from.

#### Scenario: Findings of three kinds

- **WHEN** a change still has an open checkbox, a requirement with no trace, and a label with
  no stamp
- **THEN** the response carries three findings with different rule ids, exit code `1`

#### Scenario: All three dimensions are clean

- **WHEN** the tasks are closed, every requirement has a trace, and every label is fresh
- **THEN** the command exits with code `0`

### Requirement: An open task is a finding

`verify` SHALL report a finding for every `- [ ]` checkbox in `tasks.md`. The finding text SHALL
carry the task number, its first line, and the file's line number.

A `- [x]` checkbox in any case SHALL count as closed.

A missing `tasks.md` on a change whose plan artifact is not marked skipped SHALL give code `2`:
there is nothing to check, and code `0` here would mean "no tasks left."

#### Scenario: Two open tasks

- **WHEN** `tasks.md` still has `- [ ] 4.2` and `- [ ] 7.1`
- **THEN** the response carries two findings with task numbers and line numbers

#### Scenario: No plan

- **WHEN** `verify` is called on a change with no `tasks.md` written
- **THEN** the command exits with code `2` and names
  `lexforge instructions tasks --change <name>`

#### Scenario: Uppercase mark

- **WHEN** a task is marked `- [X] 1.1`
- **THEN** the task counts as closed

### Requirement: A requirement's trace is found through tasks and changed files

`verify` SHALL treat a delta requirement as having a trace in the code when both conditions
hold:

- at least one plan task references the requirement, and every referencing task is closed;
- at least one file named in those tasks' text is changed in the change relative to the
  comparison base.

A requirement that fails either condition SHALL become a finding naming the capability and the
requirement name.

The requirement's text SHALL NOT be searched for in source files: a requirement's wording turns
up in code by coincidence, and such a search gives a green answer out of nothing.

The comparison base SHALL be the commit at which the change's directory first appeared in the
repository. Everything changed after that counts as this change's work.

#### Scenario: Requirement covered by a closed task and an edited file

- **WHEN** a requirement is named by task `3.4`, the task is closed, and a file from its text is
  changed relative to the comparison base
- **THEN** there is no finding

#### Scenario: Task closed, file untouched

- **WHEN** a task referencing a requirement is marked closed, but none of the files named in it
  is changed relative to the comparison base
- **THEN** the check reports a finding naming the requirement and the file the edit never
  touched

#### Scenario: Requirement's wording turns up in the code

- **WHEN** the requirement's name appears verbatim in a source-file comment, but no task
  references the requirement
- **THEN** the check reports a finding: a text match does not count as a trace

#### Scenario: Change with no delta specs

- **WHEN** the change's delta-spec artifact is declared skipped
- **THEN** the trace dimension gives no findings

### Requirement: Stamps are read, verification commands are not run

`verify` SHALL read `evidence.json` and judge freshness by the rules of the `evidence-freshness`
capability for every label in the `verification` section.

`verify` SHALL NOT run verification commands: a long run inside a gate turns the check before
completion into the thing that gets put off. Taking a stamp stays the job of `evidence record`.

A label in any state other than `fresh` SHALL become a finding naming the label, its state, and
the command to take a stamp.

#### Scenario: Label never run

- **WHEN** the `verification` section describes the `lint` label, and there is no stamp for it
- **THEN** the check reports a finding naming
  `lexforge evidence record --change <name> --label lint`

#### Scenario: Tests are not run again

- **WHEN** `verify` runs on a change with a fresh stamp for the `tests` label
- **THEN** the label's command does not run, and its stamp is read from the ledger

### Requirement: No check runs without described checks

`verify` SHALL exit with code `2` when the `verification` section of `lexforge/config.yaml` is
empty or absent.

A project with no described checks has nothing to confirm with, and code `0` here would read to
a skill as proof of readiness.

#### Scenario: No checks in the project

- **WHEN** `verify` is called in a project with no `verification` section
- **THEN** the command exits with code `2` and prints an example section with the `tests` and
  `lint` labels

### Requirement: The response names the boundary of the machine check

The `verify` response SHALL carry a list of what the machine did not check: whether the
implementation matches the decisions in `design.md`, whether the requirements themselves are
complete, code quality.

A skill reading code `0` SHALL get a direct pointer from the response to the work still left.
Without it, a zero exit code reads as a full check, and the text part of the check gets skipped.

#### Scenario: Clean response names the remainder

- **WHEN** `verify` exits with code `0`
- **THEN** the response carries the list of what was not checked, and it names `design.md`

#### Scenario: Remainder list in machine output

- **WHEN** `verify --change add-auth --json` is run
- **THEN** the JSON document carries the same list in its own field

### Requirement: verify's machine output is usable by a skill

`verify --json` SHALL print a single document to standard output and nothing else. The document
SHALL carry findings in the shared gate shape and a count for each of the three dimensions.

A skill SHALL decide from the exit code and the document's fields, without parsing
human-readable strings.

#### Scenario: Counts by dimension

- **WHEN** `verify --json` finds two open tasks and one stale label
- **THEN** the document carries counts of `2` for tasks, `0` for requirements, and `1` for
  stamps

#### Scenario: Standard output parses whole

- **WHEN** `verify --change add-auth --json` is run
- **THEN** the whole standard output parses as JSON with no pre-cleaning
