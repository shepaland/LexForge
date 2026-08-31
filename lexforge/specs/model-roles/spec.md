# model-roles

## Purpose

The three roles a LexForge pipeline runs under, which stage carries which role, and how a
project names the model each role runs on. An agent reads this before it writes an artifact;
whoever edits `lexforge/config.yaml` reads it to know what the file accepts.

## Requirements

### Requirement: A default model, and roles that override it

The `models` section of `lexforge/config.yaml` SHALL hold a `default` naming a provider and a
model, and MAY hold overrides for the roles `analysis`, `development` and `review`, each
naming a provider and a model of its own.

A role that is not named SHALL resolve to the `default`. An incomplete section SHALL NOT be
refused. A malformed section - a role that is not a mapping of a provider and a model - SHALL
be refused with exit code `2` naming the role and what is wrong with it.

#### Scenario: A default alone

- **WHEN** the `models` section names a `default` and no role overrides
- **THEN** every stage of the pipeline resolves to the model of the `default`

#### Scenario: One role lifted onto another model

- **WHEN** the `models` section names a `default` and an override for `review`
- **THEN** the completion check resolves to the model of `review`, and every other stage
  resolves to the model of the `default`

#### Scenario: A malformed role

- **WHEN** the `models` section names `development` as a plain string instead of a provider
  and a model
- **THEN** the command exits with code `2` and its message names the role `development` and
  the form the role takes

### Requirement: Every stage of the pipeline carries one role

Each stage SHALL carry exactly one role, fixed and not configurable: the artifacts
`proposal`, `specs`, `design` and `tasks` carry `analysis`; the implementation loop and
debugging carry `development`; the completion check carries `review`.

Archival SHALL carry no role: it merges the delta into the long-lived specs and demands no
model.

#### Scenario: A planning artifact

- **WHEN** instructions are requested for the `design` artifact of a change
- **THEN** the answer names the role `analysis` and the model that role resolves to

#### Scenario: The implementation loop

- **WHEN** the assignment is read for the implementation loop or for debugging
- **THEN** both resolve to the role `development` and to the model that role resolves to

#### Scenario: Archival

- **WHEN** a change is archived in a project whose `models` section names three different
  models
- **THEN** no model is demanded, and archival runs on whichever model is at work

### Requirement: A project without the section gets no assignment

A project whose `config.yaml` carries no `models` section SHALL get an empty assignment: no
command refuses, no stage names a model, and no skill demands one.

#### Scenario: A project installed before the section existed

- **WHEN** instructions are requested in a project whose `config.yaml` has no `models`
  section
- **THEN** the command succeeds, the answer carries no provider and no model, and the skill
  writes the artifact on whichever model is at work
