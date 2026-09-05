# artifact-graph

## Purpose

A change's state in machine-readable form: which artifact is already written, which one
can be written now, which one is blocked by unmet dependencies. Skills rely on this answer
for their queue rule: a skill whose artifact isn't in the `ready` status stops and names
the step needed.

## Requirements

### Requirement: Four artifact statuses

Every artifact of a change SHALL get exactly one status:

- `done` — the files at the artifact's path exist and hold non-whitespace text;
- `skipped` — the artifact is declared skipped in `.lexforge.yaml`;
- `ready` — the artifact isn't filled in, and every artifact in its `requires` is `done`
  or `skipped`;
- `blocked` — the artifact isn't filled in, and at least one artifact in its `requires`
  isn't `done` or `skipped`.

#### Scenario: Freshly created change

- **WHEN** a change's status is requested right after `new change` under the
  `spec-driven` schema
- **THEN** `proposal` gets `ready`, and `specs`, `design`, and `tasks` get `blocked`

#### Scenario: Proposal is written

- **WHEN** a non-empty `proposal.md` appears in the change directory
- **THEN** `proposal` gets `done`, `specs` and `design` get `ready`, and `tasks` stays
  `blocked`

### Requirement: An empty file doesn't close an artifact

A file made up only of whitespace characters SHALL count as unfilled. An artifact whose
output path is given as a glob counts as filled in once at least one non-empty file
matches the glob.

#### Scenario: Empty artifact file created

- **WHEN** a zero-size `design.md` sits in the change directory
- **THEN** `design` stays in the `ready` status, and `tasks`, which depends on it, stays
  in `blocked`

#### Scenario: Empty delta-specs directory created

- **WHEN** the `specs/` directory exists but holds no `.md` file
- **THEN** `specs` stays in the `ready` status

### Requirement: Skipping specs doesn't block the pipeline

A change with `skip_specs: true` in `.lexforge.yaml` SHALL get the `skipped` status for
the delta-specs artifact. Artifacts that depend on the skipped one count that dependency
as met.

#### Scenario: Change with no behavior change

- **WHEN** `.lexforge.yaml` holds `skip_specs: true`, and `proposal.md` and `design.md`
  are written
- **THEN** `specs` gets `skipped`, and `tasks` gets `ready`

### Requirement: The blocking reason names direct dependencies

An artifact in the `blocked` status SHALL come with a list of identifiers for the
artifacts in its `requires` that aren't `done` or `skipped`. Dependencies reached through
an intermediate artifact don't go into this list, but they do factor into the status
calculation.

#### Scenario: Both direct dependencies are unmet

- **WHEN** `tasks` requires `specs` and `design`, and neither is filled in
- **THEN** `tasks` prints as `blocked by: specs, design`

#### Scenario: Dependency unmet through an intermediate artifact

- **WHEN** `proposal` isn't written, so `specs` and `design` are in the `blocked` status
- **THEN** `tasks` stays `blocked` with the list `specs, design`, and `proposal` isn't in
  that list

### Requirement: Marker for finished planning

The `status` response SHALL hold a marker for finished planning: it's true if and only if
every artifact in the schema is `done` or `skipped`.

#### Scenario: Every artifact is written

- **WHEN** `proposal`, `specs`, `design`, and `tasks` are all filled in
- **THEN** the finished-planning marker is true

#### Scenario: The last artifact isn't written

- **WHEN** everything is filled in except `tasks.md`
- **THEN** the finished-planning marker is false

### Requirement: Instructions for a single artifact

The instructions command SHALL return, for the requested artifact: the template text, the
project context from `config.yaml`, the artifact's rules from `config.yaml`, the
instruction text from the schema, the list of dependencies with their statuses and paths,
and the allowed output path.

A request for instructions on an artifact in the `blocked` status exits with code `1` and
names the unmet dependencies.

#### Scenario: Instructions for a ready artifact

- **WHEN** instructions are requested for an artifact in the `ready` status
- **THEN** the template, context, rules, instructions, dependencies, and output path come
  back, exit code `0`

#### Scenario: Instructions for a blocked artifact

- **WHEN** instructions are requested for an artifact in the `blocked` status
- **THEN** the command exits with code `1` and names the artifacts that must be written
  first

### Requirement: Status with no change named

The status command, called with no change name, SHALL list every non-archived change with
its schema and the fraction of artifacts filled in.

#### Scenario: Several active changes in the project

- **WHEN** `lexforge/changes/` holds two non-archived changes
- **THEN** both print with their schema and a count of filled-in artifacts

#### Scenario: No active changes

- **WHEN** `lexforge/changes/` holds nothing but `archive/`
- **THEN** the command reports there are no active changes and exits with code `0`

### Requirement: Instructions name the artifact language

The instructions response SHALL hold the artifact language and a marker for whether that
language was set explicitly in `config.yaml`. From that marker, a skill knows whether to
ask the user about language or whether it was already settled earlier.

#### Scenario: Language not set in configuration

- **WHEN** instructions are requested in a project where `config.yaml` has no `language`
  field
- **THEN** the response names the language `en` and reports that no choice has been made

#### Scenario: Language set in configuration

- **WHEN** `config.yaml` holds `language: ru`
- **THEN** the response names the language `ru` and reports that the choice has been made

### Requirement: Instructions name the assigned model

The instructions response SHALL carry the provider and the model the requested artifact
resolves to for the runtime the call names. In a project with an empty assignment both fields
SHALL come back empty.

The human-readable output SHALL print the assignment on a line of its own where the project
names one. A project with an empty assignment SHALL get no such line: a line naming an empty
provider and an empty model tells its reader nothing they did not know.

#### Scenario: A project with an assignment

- **WHEN** instructions are requested for the `specs` artifact, the call names the runtime
  `codex`, and the `models` section holds an entry for `codex`
- **THEN** the response names the provider and the model of that entry, and the
  human-readable output prints the same two values

#### Scenario: A project with no assignment

- **WHEN** instructions are requested in a project whose `config.yaml` has no `models`
  section
- **THEN** the response carries an empty provider and an empty model, the human-readable
  output carries no line about a model, and the command exits with code `0`

### Requirement: Status shows the model of every stage

The status response of a change SHALL carry the assignment of every stage of the pipeline,
the stages that write no artifact included: the implementation loop, debugging, the
completion check and archival. Each entry SHALL name its stage, its provider and its model,
so a skill that writes no artifact reads its own model from the call its queue rule already
makes.

Archival demands no model, so its entry SHALL come back with an empty provider and an empty
model.

Every artifact of the change SHALL additionally carry, beside its status, the model it
resolves to.

#### Scenario: The layout of a change

- **WHEN** the status of a change is requested and the call names a runtime the `models`
  section holds an entry for
- **THEN** every artifact in the answer carries its model beside its status

#### Scenario: A stage that writes no artifact

- **WHEN** the status of a change is requested and the call names a runtime the `models`
  section holds an entry for
- **THEN** the answer names the implementation loop, debugging and the completion check, each
  with its provider and its model

#### Scenario: The stage that demands no model

- **WHEN** the status of a change is requested and the call names a runtime the `models`
  section holds an entry for
- **THEN** the entry of archival carries an empty provider and an empty model

#### Scenario: A project with no assignment

- **WHEN** the status of a change is requested in a project whose `config.yaml` has no
  `models` section
- **THEN** every stage of the answer carries an empty provider and an empty model, and the
  command exits with code `0`
