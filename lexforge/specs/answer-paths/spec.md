# answer-paths Specification

## Purpose
What form a path takes in a command's answer — in a finding, in `nextStep`, and in `--json`
fields. Read by an agent: it compares the path from the answer against paths recorded in the
spec, in the plan, and in its own instructions.

## Requirements

### Requirement: A path in a command's answer uses a forward slash

A path in a finding, in the next-step text, and in any `--json` answer field SHALL be written
with the `/` separator on every system.

The rule SHALL apply to paths the command assembles itself from parts. A path that came from
the user in an argument SHALL come back in the answer exactly as it was passed.

Field names, the `outputVersion` value, and exit codes SHALL stay the same: the value's form
changes, not the contract.

#### Scenario: A finding on Windows

- **WHEN** `lexforge validate --strict` finds a violation in `lexforge/changes/x/specs/y/spec.md`
  on Windows
- **THEN** the path in the finding is written with `/`, not `\`

#### Scenario: The next step names a file

- **WHEN** a command names a file inside the workspace as the next step
- **THEN** the path in that text is written with `/` on every system
