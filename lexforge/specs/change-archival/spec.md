# change-archival

## Purpose

What the `lexforge archive` command checks before touching disk, where the change directory
moves to, what happens to the stamp log, and what the `lexforge-archive` skill does after a
successful merge.

## Requirements

### Requirement: Archival recomputes the machine check itself

The command `lexforge archive <change>` SHALL count the same three dimensions as
`lexforge verify`: open tasks in `tasks.md`, delta requirements with no trace in the code,
and the state of stamps across every label in the `verification` section.

A finding on any dimension SHALL end the command with exit code `1`. No spec file is
written in that case, and the change directory is not moved.

A flag that turns off a dimension, and a "warn and archive anyway" mode, SHALL NOT exist. A
saved verdict from a past `verify` run SHALL NOT be accepted in place of recomputing it.

#### Scenario: An open task

- **WHEN** one empty checkbox remains in `tasks.md`
- **THEN** the command ends with exit code `1`, names the task, and does not touch
  `lexforge/specs/`

#### Scenario: A stale stamp

- **WHEN** a project file was edited after the last run of the checks
- **THEN** the command ends with exit code `1` and names the label and the reason it is
  stale

### Requirement: Planning must be complete

The command SHALL require every change artifact to be in status `done` or `skipped`.

A change with an unwritten artifact SHALL end the command with exit code `2` and text
naming the artifact and the command for getting instructions for it.

#### Scenario: Design not written

- **WHEN** archiving a change of schema `spec-driven` whose `design.md` is empty
- **THEN** the command ends with exit code `2` and names the artifact `design`

#### Scenario: An artifact skipped through configuration

- **WHEN** delta specs are skipped through `skip_specs: true`, and the rest of the
  artifacts are written
- **THEN** the precondition is met, and the command works

### Requirement: The change directory moves into the archive under a date

The command SHALL move `lexforge/changes/<name>/` to
`lexforge/changes/archive/YYYY-MM-DD-<name>/`, where the date is the local date of
archival.

The move SHALL happen after the spec files are written: the specs can be rebuilt by running
again, while a moved directory would have to be tracked down by hand.

An existing directory with that name SHALL end the command with exit code `2`: a person
sorts out the leftovers of a past archival.

#### Scenario: A successful archival

- **WHEN** the command finishes with no findings and no conflicts
- **THEN** the change directory sits at `lexforge/changes/archive/2026-08-30-add-auth/`,
  and it is gone from `lexforge/changes/`

#### Scenario: The archive directory is taken

- **WHEN** the directory `archive/2026-08-30-add-auth/` already exists
- **THEN** the command ends with exit code `2` and names the taken path

### Requirement: The stamp log moves to the archive whole

The file `evidence.json` SHALL move together with the change directory and SHALL NOT be
deleted, cleared, or merged into anything.

Stamps SHALL remain a record of what was run and against which state of the code: after
archival, this is the only trace left of that change's checks.

#### Scenario: The log after archival

- **WHEN** a change is archived
- **THEN** `lexforge/changes/archive/2026-08-30-add-auth/evidence.json` sits there with the
  same entries

#### Scenario: No log

- **WHEN** a change has no `evidence.json` file
- **THEN** this is a finding on the stamps dimension, and archival does not start

### Requirement: A change without a delta archives without a merge

A change with `skip_specs: true` SHALL go through archival without touching
`lexforge/specs/`: the directory moves, and the work ends there.

The requirement-traceability dimension SHALL stay silent for such a change: there are no
requirements.

#### Scenario: A refactor with no behavior change

- **WHEN** archiving a change that declared skipping delta specs
- **THEN** the files in `lexforge/specs/` do not change, the directory moves to the
  archive, and the exit code is `0`

#### Scenario: A skip declared, but a delta written anyway

- **WHEN** a change has `skip_specs: true` set, and delta spec files exist in it
- **THEN** the command ends with exit code `2` and names the mismatch between
  configuration and content

### Requirement: Exit codes of the archive command

The command SHALL return `0` when the delta is merged and the directory moved; `1` when a
check finding or a merge conflict is found; `2` when archival did not run — no workspace or
change, planning incomplete, archive directory taken, no repository or commit, or an empty
`verification` section.

The `--json` reply SHALL carry `outputVersion`, `workspaceRoot`, `change`, `findings`,
`summary`, `archivePath`, and `nextStep`.

#### Scenario: The skill reads the exit code

- **WHEN** the skill calls the command and gets `1`
- **THEN** it reads `findings`, fixes what is named, and calls the command again

#### Scenario: The archive path in the reply

- **WHEN** the command finishes with exit code `0` and the flag `--json`
- **THEN** the field `archivePath` names the directory the change moved to

### Requirement: The archive skill does not stand in for the check

The skill `lexforge-archive` SHALL start its work from a `lexforge-verify` report closed
with zero CRITICAL findings.

A claim that the check passed SHALL rest on that report, not on memory of an earlier
conversation. If there is no report, the skill names `lexforge-verify` as the next step and
stops.

#### Scenario: No report existed

- **WHEN** the user asks to archive a change, and there is no check report in the
  conversation
- **THEN** the skill names the check as the next step and stops

#### Scenario: A report with an open finding

- **WHEN** the report carries one CRITICAL finding
- **THEN** the skill does not call the archive command and sends the work back to that
  finding

### Requirement: The user's choice ends the branch

After a successful archival, the skill SHALL show three integration options: merge into
the base branch locally, push the branch and open a pull request, or leave the branch as
it is.

The skill SHALL wait for an answer and SHALL NOT merge, push, or delete the branch without
one. The base branch SHALL be named out loud and confirmed before the merge.

Deleting the work SHALL happen only at the user's direct request and after a separate
confirmation. It SHALL NOT appear in the list of options.

#### Scenario: The user has not answered

- **WHEN** the three options are shown, and there is no answer
- **THEN** the skill waits and does nothing to the branch

#### Scenario: Merge chosen

- **WHEN** the first option is chosen
- **THEN** the skill names the base branch, waits for confirmation, merges, and runs the
  checks on the merged result

#### Scenario: Checks failed after the merge

- **WHEN** the run on the merged result is red
- **THEN** the skill stops, leaves the branch and the working tree as they are, and names
  the failure
