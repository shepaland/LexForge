# interaction-contracts

## Purpose

A requirement that describes an exchange between components carries a picture of the
exchange and a contract for every message in it. The executor and the reviewer read field
types and limits from the spec instead of guessing them during implementation.

## Requirements

### Requirement: An interaction requirement carries a diagram and a contract

A requirement whose body holds a line `Interaction: <participant> -> <participant>[, ...]`
SHALL be called an interaction requirement.

Under `validate --strict`, an interaction requirement SHALL carry an ASCII sequence diagram
in a fenced block tagged `sequence` and a contract table directly after it. A missing
diagram or a missing table SHALL be a finding that names the requirement, the file and
the line of its `Interaction:` line.

Every participant named in the `Interaction:` line SHALL appear in the diagram.

#### Scenario: An interaction without a diagram

- **WHEN** a delta spec holds a requirement with `Interaction: web -> ingest` and no
  `sequence` block
- **THEN** `lexforge validate <change> --strict` exits `1` with a finding naming the
  requirement and the line of `Interaction:`

#### Scenario: A participant missing from the diagram

- **WHEN** the line reads `Interaction: web -> ingest, ingest -> store` and the diagram
  shows only `web` and `ingest`
- **THEN** the finding names `store` as absent from the diagram

#### Scenario: A requirement without the marker

- **WHEN** a requirement has no `Interaction:` line
- **THEN** no diagram and no contract are required of it

### Requirement: The contract table describes every field with its limits

The contract table SHALL have the columns `Message`, `From`, `To`, `Field`, `Type`,
`Required`, `Length`, `Response` and `Errors`, in this order. A message with several
fields SHALL take one row per field, with the message name repeated.

The `Length` cell SHALL be filled for a field of type `string` or `array`, and SHALL be
empty for every other type. A filled `Length` cell SHALL hold a range such as `1..255`
or an upper bound such as `<=100`.

Each violation SHALL be a finding naming the message, the field and the line.

#### Scenario: A string with no length

- **WHEN** the row for field `email` of message `login` has type `string` and an empty
  `Length` cell
- **THEN** `validate --strict` reports a finding naming `login`, `email` and the line

#### Scenario: A length on a boolean

- **WHEN** the row for field `remember` has type `boolean` and `Length` `1..5`
- **THEN** `validate --strict` reports a finding that the field has no length

#### Scenario: A complete table

- **WHEN** every string and array field states a range and every other field leaves
  `Length` empty
- **THEN** the table raises no finding

### Requirement: Diagram arrows and contract rows match

Every arrow of the diagram SHALL be labelled with a message name, and every message name
in the table SHALL label at least one arrow between the same `From` and `To`.

An arrow without a row and a row without an arrow SHALL each be a finding naming the
message.

#### Scenario: An arrow the table does not describe

- **WHEN** the diagram has an arrow `ingest -> store: save` and the table has no `save` row
- **THEN** `validate --strict` reports `save` as an arrow without a contract

#### Scenario: A row with no arrow

- **WHEN** the table has a `logout` row and no arrow carries `logout`
- **THEN** `validate --strict` reports `logout` as a contract without an arrow
