# cli-contract

## Purpose

Common behavior across every LexForge command that skills rely on: what each exit code
means, how to get a machine-readable answer, and why parsing human-readable output
doesn't count as a reliable way to check status.

## Requirements

### Requirement: Three exit codes

Every command SHALL exit with one of three codes:

- `0` — the command ran and found no findings;
- `1` — the command ran but found a violation: an unmet dependency, an invalid
  artifact, an unfilled requirement;
- `2` — the command could not run: an unknown argument, a missing change, a broken
  schema description, no workspace.

No other exit codes are allowed. The line between `1` and `2` separates "the check found
a problem in the project" from "the command call itself was wrong".

#### Scenario: Check passes

- **WHEN** a change is checked where every artifact is filled in and every requirement is
  written correctly
- **THEN** the command exits with code `0`

#### Scenario: Check finds a violation

- **WHEN** a change is checked that has a requirement with no scenario
- **THEN** the command exits with code `1`

#### Scenario: Change does not exist

- **WHEN** any command is called with the name of a change that doesn't exist in the
  workspace
- **THEN** the command exits with code `2` and prints the list of active changes

### Requirement: Machine-readable output behind a flag

Every command whose result a skill reads SHALL support a machine-output flag. With this
flag set, standard output carries a single JSON document and nothing else; progress
messages, warnings, and hints go to the error stream.

#### Scenario: Status requested as machine output

- **WHEN** the status command is called with the machine-output flag
- **THEN** standard output holds valid JSON that parses without any cleanup first, and
  progress lines print to the error stream

#### Scenario: Error with machine output

- **WHEN** a command with the machine-output flag exits with code `2`
- **THEN** standard output holds JSON with an error field and its message

### Requirement: Human output is not a contract

The content and wording of human-readable output SHALL be free to change from version to
version. A skill that needs a change's state must use the machine-output flag and the exit
code.

#### Scenario: Human-output format changes

- **WHEN** a new version changes the wording of status lines
- **THEN** this doesn't count as a breaking change, and the machine-output fields stay
  the same

### Requirement: Single entry point with a hint

A call with no command, with an unknown command, or with the help flag SHALL print the
list of available commands with a one-line description of each.

An unknown command exits with code `2`; requested help exits with code `0`.

#### Scenario: Call with no arguments

- **WHEN** the executable runs with no arguments
- **THEN** the list of commands prints, exit code `0`

#### Scenario: Typo in the command name

- **WHEN** a command name that doesn't exist is passed
- **THEN** the list of commands prints, exit code `2`

### Requirement: Successful output names the next step

A command that exits with code `0` SHALL end its human output with a line naming the next
step: the command to run next. The same command's machine output SHALL carry that step in
a separate field, with the same command text.

When there's nowhere further to go, the line and the field say plainly that no steps
remain.

#### Scenario: Change created

- **WHEN** the command that creates a change finishes successfully
- **THEN** the last line of output names the command that gives instructions for the
  schema's first artifact

#### Scenario: Same result as machine output

- **WHEN** the same command is called with the machine-output flag
- **THEN** the JSON holds a next-step field, and its text matches the human-readable line

#### Scenario: Planning is complete

- **WHEN** the status of a change is requested where every artifact is `done` or
  `skipped`
- **THEN** the output reports that planning is complete and names the move to
  implementation
