# change-workspace

## Purpose

LexForge's layout in the target project, and how a unit of work gets created: where the
long-lived specs live, where active changes live, where the archive is, and how any
command finds the workspace root from any subdirectory of the project.

## Requirements

### Requirement: Workspace initialization

The init command SHALL create a `lexforge/` directory at the project root, with a
`config.yaml` file, an empty `specs/` directory, and a `changes/archive/` directory.

`config.yaml` is created with the `context`, `rules`, `operations`, and `verification`
sections commented out, and a `schema` field holding the project's default schema.

#### Scenario: First run in a project

- **WHEN** the init command runs in a project with no `lexforge/` directory
- **THEN** `lexforge/config.yaml`, `lexforge/specs/`, and `lexforge/changes/archive/` are
  created, the command prints the list of created paths, and exits with code `0`

#### Scenario: Repeat run

- **WHEN** the init command runs in a project where `lexforge/config.yaml` already exists
- **THEN** the existing `config.yaml` stays unchanged, any missing directories get created,
  and the command reports what was created and what was left untouched

### Requirement: Installing skills into agent directories

The init command with the tool-selection flag SHALL write skill files into the
directories of the named agents and print the full list of written paths.

The flag takes a comma-separated list of names. An unknown name stops the whole install:
a partial write is not allowed.

#### Scenario: Install for a single agent

- **WHEN** init is called with a list holding one supported tool
- **THEN** skill files are written into that tool's directory, and every written path is
  printed

#### Scenario: Unknown tool in the list

- **WHEN** the list of tools contains a name the command doesn't know
- **THEN** no file is written, the command exits with code `2`, and prints the list of
  supported names

#### Scenario: Skill already installed

- **WHEN** a skill file in an agent's directory exists and differs from the one being
  shipped
- **THEN** the file is overwritten, and the command marks it as updated in the output

### Requirement: Creating a change

The command that creates a change SHALL create the `lexforge/changes/<name>/` directory
and a `.lexforge.yaml` file with a `schema` field. The change name is written in
kebab-case.

#### Scenario: Name is free

- **WHEN** a change is created with a name that isn't among the active changes or in the
  archive
- **THEN** the change directory is created with `.lexforge.yaml`, the command prints the
  path and names the next step

#### Scenario: Name is taken by an active change

- **WHEN** the `lexforge/changes/<name>/` directory already exists
- **THEN** the command exits with code `2`, and the existing directory is left unchanged

#### Scenario: Name is not kebab-case

- **WHEN** the given name contains spaces, uppercase letters, or characters outside
  `[a-z0-9-]`
- **THEN** the command exits with code `2` and shows the corrected spelling of the name

### Requirement: Declaring a specs skip

The `.lexforge.yaml` file SHALL allow a `skip_specs` field set to `true` for a change that
doesn't change product behavior: refactoring, tooling, documentation.

The field is set deliberately, by a person or a skill; the command that creates a change
doesn't write it by default.

#### Scenario: Change created by default

- **WHEN** a change is created with no extra flags
- **THEN** `.lexforge.yaml` holds `schema` and doesn't hold `skip_specs`

### Requirement: Finding the workspace root

Every command SHALL search up the tree from the current directory for the nearest
`lexforge/` directory, and work relative to the root it finds.

#### Scenario: Command run from a subdirectory

- **WHEN** a command is called from a nested project directory that has `lexforge/`
  somewhere above it in the tree
- **THEN** the command works with the workspace it finds, and the result matches running
  from the project root

#### Scenario: No workspace

- **WHEN** there's no `lexforge/` in the current directory or anywhere above it in the
  tree
- **THEN** the command exits with code `2` and suggests running init

### Requirement: Artifact language is set in configuration

The `lexforge/config.yaml` file SHALL allow a `language` field — the language the
project's artifacts are written in. The init command doesn't write this field by default:
its absence means the language hasn't been chosen yet, and `en` applies.

The init command's `--language <code>` flag SHALL write the field right away. Any
non-empty string counts as a value; the CLI doesn't parse it and passes it through as-is.

#### Scenario: Init with no language flag

- **WHEN** the init command runs with no language flag
- **THEN** the created `config.yaml` doesn't hold a `language` field

#### Scenario: Init with a language flag

- **WHEN** the init command is called with the language flag set to `ru`
- **THEN** the created `config.yaml` holds `language: ru`

### Requirement: Init writes the model section

`lexforge init` in a project without `lexforge/config.yaml` SHALL write a `models` section
holding a `tools` entry for each runtime named in `--tools` that has a vendor of its own, and
the `providers` catalogue of the installed version. No top-level `default` and no role
overrides SHALL be written.

A repeated `lexforge init` in a project whose `config.yaml` already exists SHALL leave that
file untouched, the missing `models` section included. Adding the section to an existing
project is an edit its owner makes by hand.

#### Scenario: A new project

- **WHEN** `lexforge init --tools claude` runs in a project that has no `lexforge/` directory
- **THEN** the created `config.yaml` holds a `models` section with a `tools` entry for
  `claude`, no top-level `default`, and a `providers` catalogue

#### Scenario: A project installed before this version

- **WHEN** `lexforge init` runs again in a project whose `config.yaml` has no `models`
  section
- **THEN** the file stays byte for byte as it was, and the pipeline keeps running with an
  empty assignment
