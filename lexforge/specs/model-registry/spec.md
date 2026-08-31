# model-registry

## Purpose

Where the model names a project may write come from: the catalogue inside its own
`config.yaml`, how that catalogue gets there, and what happens to a name the catalogue does
not hold. Whoever fills in the `models` section reads this to learn which names are on hand.

## Requirements

### Requirement: The catalogue lives in the project config

The `models` section SHALL hold a `providers` catalogue: one entry per provider, each with
the model names of that provider. The catalogue SHALL sit after the `default` and the role
overrides, so the assignment stays at the top of the section.

The catalogue SHALL belong to the project: a user adds a provider or a model name by editing
`lexforge/config.yaml`, and no other file is read to complete it.

#### Scenario: A model name added by hand

- **WHEN** a user adds a model name to a provider in the `providers` catalogue of their
  `config.yaml`
- **THEN** the name counts as known to that project, with no LexForge release and no other
  file touched

#### Scenario: A provider of the project's own

- **WHEN** the catalogue names a provider the shipped list never held
- **THEN** the provider and its model names count as known, and a role may name that provider

### Requirement: The catalogue is seeded once, at init

`lexforge init` SHALL write the `providers` catalogue from the list that ships with the
package. After that the shipped list SHALL NOT be read again: an upgrade of LexForge SHALL
NOT change the catalogue of a project that already has one.

#### Scenario: A new project

- **WHEN** `lexforge init` runs in a project that has no `lexforge/` directory
- **THEN** the created `config.yaml` holds a `providers` catalogue with the providers and
  model names of the installed version

#### Scenario: An upgrade of the package

- **WHEN** LexForge is upgraded in a project whose `config.yaml` already holds a catalogue
- **THEN** the catalogue stays exactly as the project wrote it

### Requirement: A name outside the catalogue passes through unchanged

A provider or a model that the catalogue does not hold SHALL be passed on as written: the
command does not refuse, and the answer carries the name from the config verbatim.

#### Scenario: A model released after the installation

- **WHEN** a role names a model that the `providers` catalogue does not hold
- **THEN** the command succeeds and the answer names that model exactly as the config wrote
  it
