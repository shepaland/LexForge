# release-readiness

## Purpose

What version the package carries and the rule it grows by, how a person and an agent learn
that version, what the changelog records, and what set of checks closes out a release.

## Requirements

### Requirement: The first published version is 1.0.0

The package SHALL publish under version `1.0.0`.

The field names of `--json` responses, the `outputVersion` value, and the commands' exit
codes SHALL count as the public contract: skills read them and break when a field gets renamed.
Changing any of them SHALL bump the major version number.

Adding a command, a flag, or a response field SHALL bump the minor number. Editing a skill's
text, a template, or a message to a person SHALL bump the patch number.

#### Scenario: A response field is renamed

- **WHEN** the `blockedBy` field in the `status` response gets a different name
- **THEN** the next package version is major

#### Scenario: A flag is added

- **WHEN** an existing command gets a new optional flag
- **THEN** the next package version is minor

### Requirement: The package version is read by a command

Calling `lexforge --version` SHALL print the version from `package.json` and exit with code
`0`.

The version SHALL be read from the installed package, not hardcoded as a string in the code:
a mismatch between the printed number and the `version` field must not be possible.

The `--json` response of the installation check SHALL carry the same version in the
`version` field.

#### Scenario: A person asks for the version

- **WHEN** `lexforge --version` is called
- **THEN** the installed package's version is printed, exit code `0`

#### Scenario: The version in a machine response

- **WHEN** `lexforge doctor --json` is called
- **THEN** the `version` field matches the output of `lexforge --version`

### Requirement: The changelog is kept by version

The repository SHALL carry `CHANGELOG.md`, where entries run from newest to oldest, and each
one carries a version number, a date, and a list of changes.

The top entry SHALL match the package's `version` field, and that match SHALL be checked by
a test: a changelog that has fallen behind the version gets caught before publication.

An entry SHALL name contract changes separately from the rest: a reader needs to know
exactly what will force them to rewrite a call.

#### Scenario: The version is bumped, the changelog is forgotten

- **WHEN** the `version` field is bumped and the changelog's top entry stays the same
- **THEN** the test fails and names both versions

#### Scenario: A changelog entry

- **WHEN** a version is released
- **THEN** its entry names the number, the date, and contract changes as a separate list

### Requirement: A test suite closes out publication

Readiness to publish SHALL be decided by a green run of `npm run test:all`, which includes
parsing the archive contents, checking the metadata, matching the version against the
changelog, and installing into a clean directory.

A separate readiness checklist SHALL NOT be kept: an item a person checks by eye gets
skipped exactly when an hour is left before release.

A red run SHALL stop publication entirely, with no split between findings that matter and
ones that can slide.

#### Scenario: Checking before publication

- **WHEN** the repository owner is about to publish a version
- **THEN** they run `npm run test:all` and publish on a green run

#### Scenario: A red run

- **WHEN** the run fails on the archive contents
- **THEN** publication doesn't start until the contents are fixed

### Requirement: The package version lands in the install manifest

The install manifest SHALL carry the version of the package that wrote the skills.

A mismatch between the manifest's version and the installed package's version SHALL be found
by the installation check command, because the skill files and the CLI code get updated by
different actions.

#### Scenario: The package is updated without reinstalling the skills

- **WHEN** the package is updated to a new version and `lexforge init --tools` hasn't been
  called
- **THEN** the installation check produces a finding with both versions

#### Scenario: The skills are reinstalled

- **WHEN** `lexforge init --tools claude` is called after the package is updated
- **THEN** the manifest's version equals the package's version, no finding
