# skill-model-table

## Purpose

The model block every LexForge skill opens with: one line per provider, naming the model that
skill wants. An agent reads the line of its own provider when the project names no model of
its own; whoever edits a skill reads this to know what belongs in the block.

## Requirements

### Requirement: Every skill opens with a model block

Each of the eight skills that demand a model SHALL open with a block naming, one line per
provider of the shipped catalogue, the model that skill runs on. `lexforge-archive` demands
no model, so its block SHALL name none and SHALL say so. Every block SHALL stand before the
queue rule and before the model gate.

The blocks SHALL be identical across runtimes: the same skill text is installed for every
agent, and only the line an agent reads differs.

#### Scenario: A skill opened by an agent

- **WHEN** an agent whose provider is OpenAI enters a skill and the project names no model
- **THEN** it works on the model that skill's block names on the OpenAI line

#### Scenario: A provider the block does not name

- **WHEN** an agent whose provider is not named in the block enters a skill and the project
  names no model
- **THEN** it works on whichever model is at work and demands no handover

#### Scenario: The skill that demands no model

- **WHEN** an agent enters `lexforge-archive`
- **THEN** the block names no model for any provider, and the work goes on whichever model is
  at work

### Requirement: The project config outranks the block

The provider and the model the project resolves to SHALL replace what the skill's block
names. The block SHALL be read only when the assignment is empty.

#### Scenario: A project with a runtime entry

- **WHEN** an agent enters a skill in a project whose `models` section names a model for its
  runtime
- **THEN** the model of the project decides, and the block of the skill is not read

#### Scenario: A project with no assignment

- **WHEN** an agent enters a skill in a project whose `models` section names no model for its
  runtime
- **THEN** the line of its provider in the skill's block decides
