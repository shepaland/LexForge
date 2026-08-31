# gate-command-contract

## Purpose

Common behavior of the four gate commands: `check plan`, `evidence record`, `check evidence`,
`verify`. This spec records how a gate's exit code differs from a normal command's exit code,
why gates carry no flag that lowers requirements, and what happens when a project has nothing
to confirm the state of its code.

## Requirements

### Requirement: Four gate commands

CLI SHALL carry four commands, each ending with an exit code a skill can read:

- `lexforge check plan --change <name>` — plan self-check;
- `lexforge evidence record --change <name> --label <label>` — take a stamp;
- `lexforge check evidence --change <name> [--require <labels>]` — stamp freshness;
- `lexforge verify --change <name>` — the machine part of the check before completion.

Each SHALL support a machine-output flag and follow the codes `0`, `1`, `2` from the shared
command-line contract.

#### Scenario: Gate called without a change name

- **WHEN** any of the four commands is called without a change name
- **THEN** the command exits with code `2` and names the call form with the required argument

#### Scenario: Gate called on a nonexistent change

- **WHEN** any of the four commands is called with a change name that does not exist in the
  workspace
- **THEN** the command exits with code `2` and prints the list of active changes

### Requirement: Exit code counts findings

Gates SHALL exit with code `1` when at least one finding turns up, and code `0` when there are
none. The finding count in the response SHALL match the length of the findings list.

Gates SHALL exit with code `2` only when the check itself could not run: no workspace, no
change, no git repository, an undescribed label, an unreadable stamp file. Code `2` means "the
check did not happen," and a skill SHALL be able to tell it apart from code `1`.

#### Scenario: One finding

- **WHEN** the plan self-check finds exactly one unrecorded task
- **THEN** the command exits with code `1`, and the findings list holds one item

#### Scenario: Check did not run

- **WHEN** `check evidence` is called in a project with no git repository
- **THEN** the command exits with code `2`, the response carries no findings list, and the
  error text names the reason

### Requirement: Gates give no ground

Gates SHALL NOT carry any flag, config setting, or environment variable that lowers
requirements: disabling a rule, downgrading a finding to a warning, or allowing exit code `0`
with a non-empty findings list.

Every gate finding SHALL carry a single level. A level that does not fail the check is
forbidden: a skill would read exit code `0` and move on with the task left open.

A project MAY extend the rule set — adding its own placeholder markers — but SHALL NOT shrink
it.

#### Scenario: Attempt to disable a rule with a flag

- **WHEN** a gate is passed an unknown flag such as `--allow-placeholders`
- **THEN** the command exits with code `2` and prints the list of supported flags

#### Scenario: Findings exist, exit code is non-zero

- **WHEN** `verify` finds one open checkbox and no other violation
- **THEN** the command exits with code `1`

### Requirement: Gates need a git repository

The commands `evidence record`, `check evidence`, and `verify` SHALL require the workspace root
to sit inside a git repository. Without a repository there is nothing to anchor a stamp to, and
the command SHALL exit with code `2`, naming `git init` as the first step.

`check plan` does not require git: it only reads change artifacts.

#### Scenario: Project without a repository

- **WHEN** `evidence record` is called in a directory with no `.git` above it
- **THEN** the command exits with code `2` and names `git init`

#### Scenario: Plan self-check without a repository

- **WHEN** `check plan` is called in the same directory
- **THEN** the missing repository is not an error, and the check runs against the artifacts

### Requirement: Machine response shape for gates

Every gate's machine response SHALL carry the fields `outputVersion`, `workspaceRoot`,
`change`, `findings`, `summary`, and `nextStep`. A findings-list item SHALL have the same shape
as an artifact-check finding: file, line number, level, rule id, text.

The `nextStep` field, when the findings list is non-empty, SHALL name the command to run after
fixing the findings.

#### Scenario: Findings in machine output

- **WHEN** `check plan --json` finds two findings
- **THEN** standard output holds a single JSON document with two findings-list items, and each
  one carries a file path and a line number

#### Scenario: Next step on findings

- **WHEN** a gate exits with code `1`
- **THEN** the next-step field names the same gate command, to run it again

### Requirement: Group command with no subcommand

Calling `lexforge check` with no subcommand, and `lexforge evidence` with no subcommand, SHALL
print the list of available subcommands with a one-line description of each and exit with code
`2`.

#### Scenario: Group called empty

- **WHEN** `lexforge check` is run
- **THEN** the subcommands `plan` and `evidence` are printed, exit code `2`

#### Scenario: Unknown subcommand

- **WHEN** `lexforge evidence dump` is run
- **THEN** the group's subcommand list is printed, exit code `2`
