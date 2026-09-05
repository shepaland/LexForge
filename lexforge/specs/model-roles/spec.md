# model-roles

## Purpose

The three roles a LexForge pipeline runs under, which stage carries which role, and how a
project names the model each role runs on. An agent reads this before it writes an artifact;
whoever edits `lexforge/config.yaml` reads it to know what the file accepts.

## Requirements

### Requirement: A project without the section gets no assignment

A project whose `config.yaml` carries no `models` section SHALL get an empty assignment: no
command refuses, no stage names a model, and no skill is held to one from the project.

A section that names no model for the calling runtime - no entry of that runtime in `tools`
and no top-level `default` - SHALL get the same empty assignment.

#### Scenario: A project installed before the section existed

- **WHEN** instructions are requested in a project whose `config.yaml` has no `models`
  section
- **THEN** the command succeeds, the answer carries no provider and no model, and the skill
  works on the model its own block names for its provider

#### Scenario: A section that carries the catalogue alone

- **WHEN** instructions are requested in a project whose `models` section holds the
  `providers` catalogue and nothing else
- **THEN** the command succeeds and the answer carries no provider and no model

### Requirement: A default model for a runtime with no entry

The `models` section MAY hold a `default` naming a provider and a model. It SHALL apply to a
call whose runtime has no entry of its own in `tools`.

A key named after one of the former roles SHALL be ignored: the section is read as if the key
were not there, and the command SHALL NOT refuse.

A malformed `default` - anything but a mapping of a provider and a model - SHALL be refused
with exit code `2` naming what is wrong with it.

#### Scenario: A default alone

- **WHEN** the `models` section names a `default` and no `tools` entries
- **THEN** every stage of the pipeline resolves to the model of the `default`

#### Scenario: A former role key left in the file

- **WHEN** the `models` section names a `default` and an `analysis` key from an earlier
  version
- **THEN** the command succeeds, and every stage resolves to the model of the `default`

#### Scenario: A malformed default

- **WHEN** the `models` section names `default` as a plain string instead of a provider and a
  model
- **THEN** the command exits with code `2` and its message names `default` and the form it
  takes

### Requirement: Archival demands no model

Archival SHALL demand no model: it merges the delta into the long-lived specs and runs on
whichever model is at work. Every other stage SHALL resolve to the model of the calling
runtime.

#### Scenario: Archival in a project that names models

- **WHEN** a change is archived in a project whose `models` section names a model for the
  calling runtime
- **THEN** no model is demanded, and archival runs on whichever model is at work

#### Scenario: A stage that writes no artifact

- **WHEN** the assignment is read for the implementation loop, for debugging or for the
  completion check
- **THEN** each resolves to the model of the calling runtime
