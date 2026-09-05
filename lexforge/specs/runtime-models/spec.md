# runtime-models

## Purpose

Model sets per runtime: how a project names the models of each agent that works in it, how a
call says which runtime it comes from, and what a runtime nobody named gets. Whoever runs
agents of two vendors over one repository reads this; so does the skill that holds an agent
to its assigned model.

## Requirements

### Requirement: A runtime names its own models

The `models` section SHALL accept a `tools` mapping, one entry per runtime name, and each
entry SHALL name a provider and a model of its own.

A malformed entry SHALL be refused with exit code `2` naming the runtime and what is wrong
with it.

#### Scenario: Two runtimes in one project

- **WHEN** the `models` section holds a `tools` entry for `claude` naming an Anthropic model
  and an entry for `codex` naming an OpenAI model
- **THEN** a stage resolved for `claude` names the Anthropic model, and the same stage
  resolved for `codex` names the OpenAI one

#### Scenario: A malformed entry

- **WHEN** the entry for `codex` is a plain string instead of a provider and a model
- **THEN** the command exits with code `2` and its message names the runtime `codex` and the
  form the entry takes

### Requirement: The calling runtime is named by the caller

`lexforge instructions` and `lexforge status` SHALL accept the name of the runtime the call
comes from. The commands SHALL read no environment marker and SHALL infer nothing: a call
that does not name a runtime is a call whose runtime is unknown.

A name outside the tool registry SHALL NOT be refused: it resolves as a runtime with no entry
of its own.

#### Scenario: A call that names its runtime

- **WHEN** `lexforge instructions` is called for an artifact and names the runtime `codex`,
  and the `models` section holds an entry for `codex`
- **THEN** the answer carries the provider and the model of that entry

#### Scenario: A call that names no runtime

- **WHEN** `lexforge status` is called for a change without naming a runtime
- **THEN** every stage resolves as it does for a runtime with no entry, and the command exits
  with code `0`

#### Scenario: A runtime the registry does not know

- **WHEN** a call names a runtime that the tool registry does not hold
- **THEN** the command succeeds and the stage resolves as it does for a runtime with no entry

### Requirement: The entry of the calling runtime decides alone

A stage SHALL be resolved for the runtime the call comes from. When that runtime has an entry
in `tools`, the stage SHALL resolve to the provider and the model of that entry, and the top
level of the section SHALL NOT be read.

A runtime with no entry SHALL resolve against the top level of the section.

#### Scenario: A runtime with an entry of its own

- **WHEN** the section holds an entry for `codex` and a top-level `default` of another
  provider, and the call comes from `codex`
- **THEN** the stage resolves to the model of the `codex` entry

#### Scenario: A runtime the section does not name

- **WHEN** the section holds an entry for `codex` only, names a top-level `default`, and the
  call comes from `claude`
- **THEN** the stage resolves to the top-level `default`

### Requirement: A runtime nothing names gets an empty assignment

When the calling runtime has no entry in `tools` and the top level of the section names no
`default`, the assignment SHALL be empty: no provider, no model. No command SHALL refuse such
a call.

#### Scenario: A runtime outside the named ones

- **WHEN** the section holds entries for `claude` and `codex`, names no top-level `default`,
  and the call comes from another runtime
- **THEN** the answer carries no provider and no model, and the command exits with code `0`

#### Scenario: A project that names no model at all

- **WHEN** instructions are requested in a project whose `models` section holds the
  `providers` catalogue alone
- **THEN** the answer carries no provider and no model
