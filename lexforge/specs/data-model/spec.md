# data-model

## Purpose

Puts the structure of every database a change touches into the change itself: the full schema
after the change and the migration that leads to it and back. The executor reads tables, fields,
keys and indexes from the change instead of guessing them, and the reviewer sees how existing
data moves and how the change is rolled back.

## Requirements

### Requirement: A project lists its data stores

`lexforge/config.yaml` SHALL hold the project's data stores as a list under `data_stores`, each
entry with a `name` in kebab-case, unique within the list, and a non-empty lower-case
`dialect`.

The dialects `postgresql`, `mysql`, `mariadb`, `sqlite`, `transactsql`, `bigquery`,
`snowflake`, `redshift`, `db2`, `hive`, `trino`, `athena` and `flinksql` SHALL be SQL
dialects. A store of any other dialect SHALL be described in Markdown.

#### Scenario: Two stores of different kinds

- **WHEN** `data_stores` lists `main` with `postgresql` and `events` with `mongodb`
- **THEN** the schema of `main` is written in SQL and the schema of `events` in Markdown

#### Scenario: A duplicate store name

- **WHEN** `data_stores` lists `main` twice
- **THEN** `lexforge validate <change> --strict` exits `1` with a finding naming `main`

### Requirement: The CLI saves a data store

`lexforge stores add <store> --dialect <dialect>` SHALL append the store to `data_stores` in
`lexforge/config.yaml`, creating the list when it is absent. A name that is not kebab-case, a
name already in the list, or an empty dialect SHALL end the command with exit code `2`, and the
config SHALL stay unchanged.

#### Scenario: Adding the first store

- **WHEN** the config has no `data_stores` and `lexforge stores add main --dialect postgresql`
  runs
- **THEN** `data_stores` holds one entry with `name: main` and `dialect: postgresql`

#### Scenario: A taken name

- **WHEN** `main` is already listed and `lexforge stores add main --dialect mysql` runs
- **THEN** the command exits `2`, names `main`, and the config is unchanged

### Requirement: A data requirement names known stores

A requirement whose body holds a line `Data: <store>[, <store>...]` SHALL be called a data
requirement. Under `validate --strict`, every store it names SHALL be listed in
`data_stores`. An unknown name, or a data requirement in a project without `data_stores`, SHALL
be a finding that names the requirement, the store and the line of `Data:`.

#### Scenario: An unknown store

- **WHEN** a delta spec holds `Data: billing` and `data_stores` lists only `main`
- **THEN** `validate --strict` exits `1` with a finding naming `billing` and the line of
  `Data:`

#### Scenario: No stores declared

- **WHEN** a delta spec holds `Data: main` and the config has no `data_stores`
- **THEN** `validate --strict` exits `1` with a finding naming `data_stores`

#### Scenario: A requirement without the marker

- **WHEN** no requirement of the change holds a `Data:` line
- **THEN** no schema and no migration are required of the change

### Requirement: A data requirement carries the schema and the migration of each store

For every store named by a data requirement, the change SHALL hold, under
`data/<store>/`, the full schema of the store after the change and one migration with a forward
and a backward step: `schema.sql`, `up.sql` and `down.sql` for an SQL dialect, `schema.md`,
`up.md` and `down.md` for any other. Each file SHALL parse for the store's dialect. A missing
file, a file in the format of the other kind, or a file that does not parse SHALL be a finding
naming the store and the file.

#### Scenario: A migration without a rollback

- **WHEN** the change names `main` (postgresql) and holds `data/main/schema.sql` and
  `data/main/up.sql` but no `data/main/down.sql`
- **THEN** `validate --strict` exits `1` with a finding naming `main` and `down.sql`

#### Scenario: SQL that does not parse

- **WHEN** `data/main/up.sql` holds `ALTER TABLE orders ADD COLUM note text`
- **THEN** `validate --strict` exits `1` with a finding naming `data/main/up.sql`

### Requirement: A Markdown schema is written in field and key tables

A Markdown schema SHALL describe each table under a heading `## Table: <table>`, with a field
table of the columns `Field`, `Type`, `Nullable`, `Default` and a key table of the columns
`Key`, `Fields`, where `Key` is `primary`, `unique`, `index` or `foreign`. A foreign key
SHALL read `<field> -> [<store>.]<table>.<field>`. A nested field SHALL be written with dots.

A Markdown migration step SHALL head each table `## Table: <table> (create|alter|drop)`, add
the column `Action` with `add`, `change` or `drop` to its field and key tables, and carry a
`## Data migration` section that is not empty. A step that moves no data SHALL say in that
section why.

Every table, in either format, SHALL have a primary key.

#### Scenario: A table without a primary key

- **WHEN** `data/events/schema.md` describes `user_events` with no `primary` row
- **THEN** `validate --strict` exits `1` with a finding naming `user_events`

#### Scenario: An empty data migration section

- **WHEN** `data/events/up.md` has a `## Data migration` heading with nothing under it
- **THEN** `validate --strict` exits `1` with a finding naming `up.md`

### Requirement: The migration leads from the project schema to the change schema and back

Under `validate --strict`, applying the forward step to the project schema
`lexforge/data/<store>/schema.*`, or to an empty schema when the store has none yet, SHALL give
the change schema, and applying the backward step to the change schema SHALL give the project
schema. Tables, fields with type, nullability and default, primary keys, unique constraints,
indexes and foreign keys SHALL be compared. Every difference SHALL be a finding naming the
store, the step, the table and the field or key. Statements that change rows rather than
structure SHALL NOT take part in the comparison.

#### Scenario: A rollback that forgets an index

- **WHEN** `up.sql` adds the index `orders_note_idx` and `down.sql` drops the column `note`
  but not the index
- **THEN** `validate --strict` exits `1` with a finding naming `main`, `down.sql`, `orders` and
  `orders_note_idx`

#### Scenario: A schema that drifted from the migration

- **WHEN** `up.sql` adds `orders.note` as `text` and `schema.sql` declares it as
  `varchar(200)`
- **THEN** `validate --strict` exits `1` with a finding naming `orders.note` and both types

#### Scenario: The first migration of a new store

- **WHEN** `lexforge/data/main/` does not exist and the change holds a schema and a migration
  for `main`
- **THEN** the forward step is applied to an empty schema and the backward step must leave an
  empty schema
