# evidence-ledger

## Purpose

The run log for checks: where the command comes from, how it runs, and what stays on disk
after the run. A claim of "tests are green" does not confirm itself, so a machine takes the
stamp: it knows the exit code, the time, the state of the code, and the tail of the output.
This spec records what goes into `evidence.json`, why the command can't be passed as an
argument, and how the file survives two people working on the same change from opposite sides.

## Requirements

### Requirement: Verification commands live in the project config

The file `lexforge/config.yaml` SHALL carry a `verification` section: a verification label and
one command under it. A label is a short name like `tests`, `lint`, `types`, `build`.

`evidence record --label <label>` SHALL take its command from this section by label.

A label missing from the section SHALL exit the command with code `2`. The error text SHALL
name the labels described in the project and print ready-to-paste YAML lines to add to the
config. It SHALL NOT guess which command was meant.

#### Scenario: Label is described

- **WHEN** the `verification` section records `tests: npm test`, and
  `evidence record --change add-auth --label tests` is called
- **THEN** `npm test` runs

#### Scenario: Label missing from config

- **WHEN** `evidence record --change add-auth --label e2e` is called, and the `verification`
  section has no `e2e` label
- **THEN** the command exits with code `2`, lists the described labels, and prints YAML lines
  with a place for the command

#### Scenario: No verification section at all

- **WHEN** `lexforge/config.yaml` has no `verification` section
- **THEN** the command exits with code `2` and prints a full example of the section

### Requirement: A free-form command is not accepted as an argument

`evidence record` SHALL accept only a change name and a label. A positional argument carrying a
command, a flag carrying a command, and an environment variable overriding the label's command
SHALL NOT be supported.

A free-form command input hands the agent a green stamp for `true`, and the ledger stops
confirming anything.

#### Scenario: Extra positional argument

- **WHEN** `lexforge evidence record --change add-auth --label tests -- true` is run
- **THEN** the command exits with code `2` and names the call form with two flags

#### Scenario: Label not given

- **WHEN** `lexforge evidence record --change add-auth` is run
- **THEN** the command exits with code `2` and lists the labels of the `verification` section

### Requirement: A run is recorded on any outcome

`evidence record` SHALL run the label's command to completion and record a stamp regardless of
the command's exit code. A failed run SHALL leave a record with the non-zero code.

There SHALL be no way to skip recording a failed run: a ledger holding only green runs shows a
history that never happened.

The command SHALL exit with code `0` when the run's exit code is zero, and code `1` when it
isn't. A run that never started (no such executable, the shell failed to launch) SHALL give
code `2`, and the stamp SHALL NOT be recorded in that case.

#### Scenario: Failed run

- **WHEN** the `tests` label's command exits with code `1`
- **THEN** the stamp is recorded with code `1`, and `evidence record` exits with code `1`

#### Scenario: Green run

- **WHEN** the label's command exits with code `0`
- **THEN** the stamp is recorded with code `0`, and `evidence record` exits with code `0`

#### Scenario: Command did not launch

- **WHEN** the label's command names an executable that does not exist
- **THEN** the command exits with code `2`, the stamp file does not change, and the error text
  names the label and its command

### Requirement: A stamp carries the state of the code at run time

Every ledger record SHALL carry: the label, the command run, the exit code, the start time and
duration of the run, the `HEAD` commit, the fingerprint of the working tree, and the tail of the
output.

The start time SHALL be recorded in UTC, ISO 8601. The fingerprint of the working tree SHALL be
computed by the rules of the `evidence-freshness` capability.

The process environment, environment variables, and the `lexforge` call arguments SHALL NOT
enter the record: tokens and paths of the developer's machine live there, and the file gets committed.

#### Scenario: Record fields

- **WHEN** a run of the `tests` label finishes
- **THEN** the label's record carries the command, exit code, start time, duration, `HEAD`,
  tree fingerprint, and output tail

#### Scenario: Environment does not enter the file

- **WHEN** a run executes with an environment variable holding a token
- **THEN** neither the variable's name nor its value appears in `evidence.json`

### Requirement: The output tail is bounded in size

A stamp SHALL store the tail of the command's output: standard output and standard error,
merged in arrival order. The tail's size SHALL be bounded, and a truncated record SHALL carry a
truncation flag.

The command's full output SHALL print to the screen during the run: the agent sees it right
away, and only the tail goes into the file.

#### Scenario: Long output

- **WHEN** the label's command prints output longer than the limit
- **THEN** the record holds the end of the output, and the truncation flag is set

#### Scenario: Short output

- **WHEN** the label's command prints three lines
- **THEN** the record holds all three lines, and the truncation flag is unset

### Requirement: The stamp file lives in the change directory

The ledger SHALL be stored at `lexforge/changes/<name>/evidence.json` and SHALL be committed
along with the rest of the change's artifacts: the stamp is visible in review and checkable by
someone else.

The file SHALL carry a format version and records keyed by label: one latest record per label.
A history of past runs SHALL NOT accumulate — freshness is judged by the latest record, and old
records only grow merge conflicts.

#### Scenario: First run on a change

- **WHEN** `evidence record` runs on a change with no `evidence.json` yet
- **THEN** the file is created with one record and a format version

#### Scenario: Same label run again

- **WHEN** the `tests` label runs a second time
- **THEN** the label's record is replaced whole, and the record count does not change

### Requirement: Recording one label leaves other labels untouched

`evidence record` SHALL read the stamp file, replace one label's record, and write the whole
file back. Other labels' records SHALL be preserved verbatim.

The file SHALL be written to a temp file alongside it and renamed over the original: an
interrupted write does not leave a broken ledger behind.

Labels in the file SHALL sort alphabetically, indentation SHALL be constant, and the file SHALL
end with a newline. The same ledger content always produces the same text, and a branch merge
touches only the lines that actually changed.

#### Scenario: Two labels in one file

- **WHEN** the `tests` label is recorded, then the `lint` label
- **THEN** the file carries both records, and the `tests` record matches what was recorded
  earlier

#### Scenario: Record order

- **WHEN** labels are recorded in the order `tests`, `build`, `lint`
- **THEN** the file lists them in the order `build`, `lint`, `tests`

### Requirement: A broken stamp file stops the work

`evidence record`, and any command reading the ledger, SHALL exit with code `2` when
`evidence.json` fails to parse or does not match the record format.

Silently overwriting a broken file SHALL NOT happen: the file breaks from a merge conflict, and
losing someone else's stamp is worse than stopping.

#### Scenario: File does not parse

- **WHEN** `evidence.json` contains merge-conflict markers
- **THEN** the command exits with code `2`, names the file path, and asks to resolve the
  conflict

#### Scenario: Record missing a required field

- **WHEN** a label's record has no exit code
- **THEN** the command exits with code `2` and names the label and the missing field
