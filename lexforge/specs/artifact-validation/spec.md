# artifact-validation

## Purpose

Checking that a change's artifacts are filled in, and that requirements are written in a
form a program can read: every requirement carries a scenario, and every scenario carries
a condition and a result. Each finding prints with a file path and a line number.

## Requirements

### Requirement: A requirement carries at least one scenario

A delta spec SHALL hold requirements written as `### Requirement: <name>`, and every
requirement SHALL carry at least one `#### Scenario: <name>` block.

#### Scenario: Requirement with no scenarios

- **WHEN** a `### Requirement:` heading has no `#### Scenario:` before the next
  requirement
- **THEN** the check reports a finding with the file path, the line number, and the
  requirement's name, and the command exits with code `1`

#### Scenario: Requirement with no name

- **WHEN** a requirement heading has no text after the colon
- **THEN** the check reports a finding with the path and the line number

### Requirement: A scenario holds a condition and a result

A scenario block SHALL hold at least one line with a `WHEN` marker and at least one line
with a `THEN` marker.

#### Scenario: Scenario has no result

- **WHEN** a scenario block holds `WHEN` and doesn't hold `THEN`
- **THEN** the check reports a finding with the scenario's name and the line number

### Requirement: Scenario heading depth is checked explicitly

A scenario heading SHALL carry exactly four hashes. A heading with three or five hashes
inside a requirement block, whose text starts with the word `Scenario`, SHALL become a
finding that states the expected depth.

Silently skipping such a heading isn't allowed: a scenario at the wrong depth would
otherwise fall out of the check, leaving the requirement looking empty with no explanation
why.

#### Scenario: Scenario written with three hashes

- **WHEN** `### Scenario: <name>` appears inside a requirement
- **THEN** the check reports a finding, names the expected four hashes, and prints the
  line number

### Requirement: Delta operation headings

A delta spec SHALL group requirements under the headings `## ADDED Requirements`,
`## MODIFIED Requirements`, `## REMOVED Requirements`, `## RENAMED Requirements`. A
requirement outside such a group counts as a finding.

A requirement under `## REMOVED Requirements` SHALL carry `**Reason**` and `**Migration**`
lines.

#### Scenario: Requirement outside an operation group

- **WHEN** `### Requirement:` appears before the first operation heading
- **THEN** the check reports a finding and lists the allowed headings

#### Scenario: Removal with no reason and no migration path

- **WHEN** a requirement under `## REMOVED Requirements` lacks `**Reason**` or
  `**Migration**`
- **THEN** the check reports a finding with the requirement's name

### Requirement: A zero delta is rejected

A change with not a single requirement in its delta specs SHALL count as invalid, unless
its `.lexforge.yaml` has `skip_specs: true` set.

The finding's text names `skip_specs: true` as the fix for a change that doesn't change
behavior, and warns that a made-up requirement doesn't count as a fix.

#### Scenario: Specs aren't written and no skip is declared

- **WHEN** a change is checked whose `specs/` directory is empty, and `skip_specs` isn't
  set
- **THEN** the command exits with code `1` and names `skip_specs: true` as the option for
  a change with no behavior change

#### Scenario: Skip is declared

- **WHEN** a change is checked with `skip_specs: true` and an empty `specs/` directory
- **THEN** the missing delta doesn't count as a finding

### Requirement: Strict mode adds completeness checks

The strict-mode flag SHALL turn on extra checks:

- a delta for a new capability carries a `## Purpose` section at least 50 characters long;
- no submitted artifact holds unfilled template placeholders: `<!-- ... -->` comments,
  angle-bracket placeholders like `<capability-path>`, `<name>`, `<condition>`;
- every artifact the schema requires is in the `done` or `skipped` status.

#### Scenario: Short Purpose

- **WHEN** in strict mode, a delta for a new capability is checked whose `## Purpose`
  section is 20 characters long
- **THEN** the check reports a finding and names the required length

#### Scenario: Template comments remain in the artifact

- **WHEN** in strict mode, `proposal.md` is checked and still has a comment left over from
  the template
- **THEN** the check reports a finding with the line number

#### Scenario: Normal mode on the same file

- **WHEN** the same file is checked without the strict-mode flag
- **THEN** there are no findings about `Purpose` length or template placeholders

### Requirement: A finding names its place in the file

Every finding SHALL print with a relative file path, a line number, a severity level, and
text explaining what to fix.

#### Scenario: Several findings in different files

- **WHEN** the check finds violations in two delta specs
- **THEN** findings print grouped by file, each with its own line number
