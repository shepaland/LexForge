# schema-registry

## Purpose

Data describes the artifact pipeline: which artifacts belong to a schema, in what order,
what depends on what, where the template comes from, and what path the result is written
to. Adding a schema with its own artifact order doesn't require touching the `status`,
`instructions`, and `validate` commands.

## Requirements

### Requirement: A schema describes artifacts as data

A schema SHALL describe an ordered list of artifacts. Each artifact carries these fields:
a kebab-case identifier, a one-line description, a path to its template file, an output
path pattern relative to the change directory, a list of identifiers in `requires`, and
instruction text for the agent.

Commands get artifact order and dependencies only from the schema description. Order
hard-coded into a command is not allowed.

#### Scenario: Schema is read when a command runs

- **WHEN** any command that works with a change runs
- **THEN** it reads the schema description named in that change's `.lexforge.yaml` and
  builds the artifact list from it

#### Scenario: Requested artifact is not in the schema

- **WHEN** a user calls `lexforge instructions design` for a change whose schema has no
  `design` artifact
- **THEN** the command exits with code `2`, names the schema, and lists its artifacts

### Requirement: Two built-in schemas

The package SHALL ship the `spec-driven` and `bounded` schemas.

`spec-driven`: `proposal` → `specs` → `design` → `tasks`. `specs` and `design` require
`proposal`; `tasks` requires `specs` and `design`.

`bounded`: `proposal` → `specs` → `tasks`. `tasks` requires `specs`.

The default schema is `spec-driven`.

#### Scenario: Change created with no schema given

- **WHEN** `lexforge new change <name>` runs without the `--schema` flag
- **THEN** `.lexforge.yaml` gets `schema: spec-driven`, and the change directory gets four
  artifacts

#### Scenario: Change created with the bounded schema

- **WHEN** `lexforge new change <name> --schema bounded` runs
- **THEN** `status` shows three artifacts, and `design` is missing from the output

#### Scenario: Requested schema doesn't exist

- **WHEN** `--schema` is given a name that isn't among the built-in schemas
- **THEN** the command exits with code `2` and prints the list of available schemas

### Requirement: The output path pattern allows a single file or a set of files

The output path field SHALL accept two forms: a path to a specific file (`proposal.md`,
`design.md`, `tasks.md`), and a glob covering a set of files (`specs/**/*.md`).

The path's form determines how the artifact counts as filled in, and what
`resolvedOutputPath` prints.

#### Scenario: Artifact with a single file

- **WHEN** the output path is requested for the `proposal` artifact
- **THEN** an absolute path to the single file inside the change directory is returned

#### Scenario: Artifact with a set of files

- **WHEN** the output path is requested for the `specs` artifact
- **THEN** the glob `<change>/specs/**/*.md` is returned, and the agent decides for itself
  how many files to create under it

### Requirement: A broken schema description stops the run

The schema description SHALL be validated before the command runs. A cycle in the
`requires` edges, a reference to an artifact that doesn't exist, a missing template file,
a duplicate artifact identifier, and an empty artifact list all count as description
errors.

#### Scenario: Cycle in dependencies

- **WHEN** in a schema `a` requires `b`, and `b` requires `a`
- **THEN** the command exits with code `2`, names the schema, and lists the artifacts in
  the cycle

#### Scenario: Artifact template not found

- **WHEN** a schema artifact references a template file that isn't on disk
- **THEN** the command exits with code `2` and prints the expected template path

### Requirement: Artifact instructions name the next step

Artifact instructions SHALL end with the next step: the name of the artifact written after
the current one, and the command that gives its instructions. The last artifact's
instructions in a schema name the move to implementing the change.

Instruction text SHALL be written in short sentences and plain words: an agent reads the
instructions, and it will trim a long sentence its own way.

#### Scenario: Another artifact follows

- **WHEN** the instructions for an artifact are read, and the schema has another artifact
  after it
- **THEN** the last lines of the instructions name that artifact and the command that gives
  its instructions

#### Scenario: Artifact is last in the schema

- **WHEN** the instructions for a schema's last artifact are read
- **THEN** the last lines name the move to implementing the change
