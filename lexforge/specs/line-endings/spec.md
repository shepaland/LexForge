# line-endings Specification

## Purpose
What change artifacts are parsed with, and why the team's answer doesn't depend on whether a
file is saved with Unix or Windows line endings. Read by whoever runs a project on Windows or
keeps files in the repo that came from an editor on the other side.

## Requirements

### Requirement: Artifact parsing doesn't depend on line endings

Commands that read change artifacts SHALL give the same answer on a file with `\r\n` as on a
file with `\n`: the same findings, the same line numbers, the same exit code.

The rule SHALL apply to delta specs, `tasks.md`, the main specs in `lexforge/specs/`, and the
project configuration.

Normalization SHALL happen in one place — when the file is read — not as separate fixes in each
parsing template. A template fixed on its own repairs one command and leaves the rest broken.

#### Scenario: A delta spec with Windows line endings

- **WHEN** `specs/<capability>/spec.md` is saved with `\r\n` line endings and carries a scenario
  without a line starting with `**THEN**`
- **THEN** `lexforge validate --strict` names the finding `scenario-without-then`
  and exits with code `1`

#### Scenario: A plan with Windows line endings

- **WHEN** `tasks.md` is saved with `\r\n` line endings and carries a task with an
  angle-bracket placeholder
- **THEN** `lexforge check plan` names the finding and exits with code `1`

#### Scenario: A line number in a finding is counted from the file

- **WHEN** a finding points to line seven of a file with `\r\n` line endings
- **THEN** the answer shows line `7`, the same as for the same file with `\n` line endings

#### Scenario: Mixed line endings in one file

- **WHEN** part of a file's lines end with `\r\n` and part with `\n`
- **THEN** parsing gives the same answer as for a file written entirely with `\n`
