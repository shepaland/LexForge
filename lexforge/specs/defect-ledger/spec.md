# defect-ledger

## Purpose

The project record of defects a session found and did not fix. A verification report lives in a
message and dies with the session, so a finding nobody had time for stops existing the moment
the conversation is compacted. This spec records where the ledger file sits, what an entry
carries, the commands that write and read it, and which open entry stops a gate.

## Requirements

### Requirement: The ledger belongs to the project, not to a change

The file `lexforge/defects.json` SHALL hold every defect recorded in the project. It SHALL sit
beside `lexforge/config.yaml` and SHALL NOT move when a change is archived.

An entry SHALL name the change it was found in. That name SHALL stay readable after the change
directory has moved into the archive.

#### Scenario: The change is archived, the entry stays

- **WHEN** a change with one open entry in the ledger is archived
- **THEN** `lexforge/defects.json` still holds that entry, still open, still naming the archived
  change

#### Scenario: A second change reads the same file

- **WHEN** a defect is recorded while working on a second change
- **THEN** both entries sit in the same file, each naming its own change

### Requirement: Recording a defect needs a level, a place and a summary

The command `lexforge defect record` SHALL add one entry to the ledger. It SHALL take the
change under `--change`, the level under `--level`, the file under `--file`, the line number
under `--line`, and the summary under `--summary`. The level SHALL be one of `critical`,
`important`, `minor`.

A call missing the change, the level, the file, the line or the summary SHALL exit with code
`2` and name the flag it lacks. A level outside the three SHALL exit with code `2` and name the
three.

A summary with no place to look SHALL NOT be accepted: the reviewer's answer that names no file
and line is empty, and so is the ledger entry made from it.

#### Scenario: No file given

- **WHEN** `lexforge defect record --change add-auth --level minor --summary "duplicated
  parser"` is run
- **THEN** the command exits with code `2` and names the missing `--file` and `--line`

#### Scenario: A level outside the three

- **WHEN** the call carries `--level blocker`
- **THEN** the command exits with code `2` and names `critical`, `important`, `minor`

#### Scenario: A complete call

- **WHEN** the call carries a change, a level, a file, a line and a summary
- **THEN** the entry is written and the command exits with code `0`

### Requirement: A recorded defect gets an identifier and an open state

Every entry SHALL carry an identifier unique within the ledger, the change name, the level, the
file, the line, the summary, the state, and the time it was recorded. A new entry's state SHALL
be `open`.

The `--json` reply SHALL carry `outputVersion`, `workspaceRoot`, `defect` and `nextStep`, and
`defect` SHALL carry the identifier.

#### Scenario: The identifier comes back to the caller

- **WHEN** `lexforge defect record ... --json` exits with code `0`
- **THEN** the reply names the identifier of the entry just written

#### Scenario: Two records, two identifiers

- **WHEN** two defects are recorded in the same change
- **THEN** the ledger holds two entries with different identifiers

### Requirement: A fixed defect is closed, never deleted

The command `lexforge defect close <id>` SHALL set the entry's state to `closed` and record the
time. The entry SHALL stay in the file with every field it was recorded with.

An identifier absent from the ledger SHALL exit with code `2`. An entry already closed SHALL
exit with code `2` and name its state.

A command that removes an entry from the ledger SHALL NOT exist.

#### Scenario: After closing

- **WHEN** an open entry is closed
- **THEN** the file still holds it, with state `closed` and the time it was closed

#### Scenario: An unknown identifier

- **WHEN** `lexforge defect close nosuchid` is run
- **THEN** the command exits with code `2` and names the identifier it could not find

### Requirement: Listing shows the state of every entry

The command `lexforge defect list` SHALL print every entry with its identifier, change, level,
file, line, summary and state. The flag `--change <name>` SHALL narrow the list to one change,
and `--open` SHALL narrow it to entries whose state is `open`.

The `--json` reply SHALL carry the same entries as an array.

#### Scenario: Open and closed together

- **WHEN** the ledger holds one open and one closed entry, and `lexforge defect list` is run
- **THEN** both are printed, each with its state

#### Scenario: Narrowed to one change

- **WHEN** `lexforge defect list --change add-auth --open` is run
- **THEN** only open entries of `add-auth` are printed

### Requirement: An open defect above MINOR stops the gates

An entry whose state is `open` and whose level is `critical` or `important` SHALL be a finding
for the change it names: `lexforge verify --change <name>` and `lexforge archive <name>` SHALL
end with exit code `1` while it stands.

An open entry at level `minor` SHALL NOT be a finding on either command.

No flag SHALL let a gate ignore the ledger, and no flag SHALL lower an entry's level. A level
is changed by recording what the code does, not by the clock.

#### Scenario: An open important defect

- **WHEN** the ledger holds an open `important` entry for the change and every other measure is
  clean
- **THEN** both commands end with exit code `1` and name the entry

#### Scenario: An open minor defect

- **WHEN** the ledger holds three open `minor` entries for the change and every other measure is
  clean
- **THEN** both commands end with exit code `0`, and the entries stay open

#### Scenario: A defect of another change

- **WHEN** the ledger holds an open `critical` entry naming a different change
- **THEN** it is no finding for this change, and this change's gates are unaffected
