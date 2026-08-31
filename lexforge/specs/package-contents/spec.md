# package-contents

## Purpose

What the published package archive holds and what it leaves out, how the entry point
behaves on the wrong runtime and without a build, what metadata the package carries, and what
the README tells someone installing LexForge into their project.

## Requirements

### Requirement: The archive carries everything the pipeline needs to run

The published archive SHALL carry the executable `bin/lexforge.js`, the built code
under `dist/`, schema descriptions and artifact templates under `schemas/`, skill directories
under `skills/`, and `CHANGELOG.md`.

The `skills/` directory SHALL carry nine `SKILL.md` files and every supporting file next
to them, including `skills/lexforge-apply/reviewer-prompt.md`. The `schemas/` directory SHALL
carry the description of each schema and all of its templates.

A file the package ships SHALL match the repository file byte for byte: installation copies
it and builds nothing on the fly.

#### Scenario: Skills in the archive

- **WHEN** the package archive is unpacked
- **THEN** nine directories sit under `skills/`, each with a `SKILL.md`, and
  `reviewer-prompt.md` sits next to `skills/lexforge-apply/SKILL.md`

#### Scenario: Schemas and templates in the archive

- **WHEN** the package archive is unpacked
- **THEN** under `schemas/` sit the descriptions of the `spec-driven` and `bounded` schemas and seven template files

### Requirement: Development traces do not reach the archive

The archive SHALL NOT carry the directories `tests/`, `openspec/`, `docs/`, `.claude/`,
`node_modules/`, and `src/`.

The archive SHALL NOT carry source maps `*.js.map` or declaration files `*.d.ts`: a map
points to source that isn't in the archive, and nobody asks a command-line program for type
declarations.

The contents check SHALL run against the unpacked archive: the `files` field describes
intent, the unpacked archive describes the result.

#### Scenario: A forbidden path in the archive

- **WHEN** any path from the forbidden list turns up in the unpacked archive
- **THEN** the contents check fails and names the path

#### Scenario: A source map next to the build

- **WHEN** a file with the extension `.js.map` or `.d.ts` sits under `dist/` in the unpacked archive
- **THEN** the contents check fails and names the file

### Requirement: The archive is built from a fresh build

Packaging SHALL run the build before assembling the archive: the `dist/` in the archive
matches the source of the same commit.

The manual order "build, then package" SHALL NOT be a condition for a correct archive:
packaging without a build step first gives the same result.

#### Scenario: Packaging without a manual build

- **WHEN** the `dist/` directory is deleted and package packaging runs
- **THEN** the archive carries the built code, and the entry point from the archive runs

#### Scenario: A stale build on disk

- **WHEN** `dist/` was built from an earlier version of the source and packaging runs
- **THEN** the archive carries the code built during packaging

### Requirement: The entry point fails clearly

The entry point SHALL check the Node version against the `engines` field and, on a mismatch,
SHALL print one line with the required and the current version and exit with code `2`.

The entry point SHALL check that the built code exists and, without it, SHALL print one line
with the build command and exit with code `2`.

A Node stack trace SHALL NOT be the only thing a person sees in these two cases.

#### Scenario: An old Node

- **WHEN** the command runs on a Node version below the one named in `engines`
- **THEN** one line prints both versions, exit code `2`

#### Scenario: A package without a build

- **WHEN** the package is installed from the repository and the `dist/` directory is missing
- **THEN** one line prints the build command, exit code `2`

### Requirement: The package metadata is named in full

`package.json` SHALL carry the fields `name`, `version`, `description`, `license`, `author`,
`repository`, `homepage`, `bugs`, `keywords`, `engines`, `bin`, `files`, `type`,
and `publishConfig`.

The `bin` field SHALL name one command, `lexforge`. The `engines.node` field SHALL name
the minimum version the tests run on.

#### Scenario: A missing metadata field

- **WHEN** any of the listed fields is missing from `package.json`
- **THEN** the metadata check fails and names the field

#### Scenario: The command name

- **WHEN** the package is installed
- **THEN** it gives one command named `lexforge`

### Requirement: The README is written for the person installing

The README SHALL answer a reader installing LexForge into their project, and SHALL carry
sections covering: what LexForge does, the runtime requirements, installation and how to check
it, the first run step by step, the nine skills with the moment each fires, commands and exit
codes, and what to commit versus what stays local.

The installation section SHALL name every runtime from the tool registry and the directory
its skills land in.

The README SHALL NOT describe developing LexForge itself: the build, running tests, pressure
scenarios, and the stage order.

#### Scenario: A reader installs the package

- **WHEN** a person opens the README after installing the package
- **THEN** they find the first-run command and the command that checks the installation

#### Scenario: A new runtime in the registry

- **WHEN** a row is added to the tool registry
- **THEN** the README installation section names its name and directory
