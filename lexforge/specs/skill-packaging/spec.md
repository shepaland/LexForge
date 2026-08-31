# skill-packaging

## Purpose

Where skill files live in the repository, how they reach the published package and the
user's project, and which properties of their structure the automated tests check.

## Requirements

### Requirement: A skill is a directory with one required file

Every skill SHALL live at `skills/<skill name>/SKILL.md` at the root of the LexForge
repository. The directory name SHALL consist of lowercase Latin letters, digits, and hyphens.

The stage's skills SHALL be named `lexforge`, `lexforge-propose`, `lexforge-spec`,
`lexforge-design`, `lexforge-plan`.

Supporting material SHALL live as a separate file next to `SKILL.md` and be linked one level
deep. There SHALL be no links that load a file before it's needed, and no links that go two
levels deep.

#### Scenario: Body outgrows its budget

- **WHEN** the body of `SKILL.md` no longer fits its allotted size
- **THEN** the heavy part is moved to a file next to it, and `SKILL.md` keeps a link to it

#### Scenario: Link two levels deep

- **WHEN** a file next to the skill links to a third file needed for the work
- **THEN** this counts as a defect: the material is moved to one level from `SKILL.md`

### Requirement: Skills are installed by the init command

`lexforge init --tools <list>` SHALL lay out the package's `skills/` directory into each
named tool's directory inside the user's project.

After install, the project SHALL have five skill directories with `SKILL.md` files that
match the package's files byte for byte.

An unknown tool name SHALL stop the install before the first write: there is no such thing as
a partially installed skill.

#### Scenario: Install for one tool

- **WHEN** command `lexforge init --tools claude` runs in an empty project
- **THEN** five skill directories appear under `.claude/skills/`, each carrying a `SKILL.md`

#### Scenario: Unknown tool

- **WHEN** the tool list names something that isn't in the registry
- **THEN** the command exits with code `2`, and not one skill file is written

### Requirement: Skills reach the published package

The `files` field in `package.json` SHALL list the `skills` directory, so it lands in the
built package alongside `dist`, `bin`, and `schemas`.

Installing the package from a tarball into another project SHALL yield a working init command
that finds skills by a path from its own module, not from the working directory.

#### Scenario: Building the tarball

- **WHEN** the package is built by the pack command
- **THEN** the tarball holds five `SKILL.md` files under directory `skills/`

#### Scenario: Install into another project

- **WHEN** the package from the tarball is installed into a temporary empty project, and init
  runs there with a tool list
- **THEN** the skills are laid out into the tool's directory, exit code `0`

### Requirement: Automated tests check skill structure

Tests SHALL check, for every `skills/*/SKILL.md` file: the frontmatter parses and carries
exactly the `name` and `description` fields; `name` matches the directory name; `description`
starts with `Use when`; the length of `description` stays under its limit; the body stays
under its size limit.

Tests SHALL check that every `lexforge` command named in a skill's body exists in this
repository's CLI.

A test SHALL fail when a skill's body contains a command that doesn't yet exist in the CLI:
the planning skills do not rely on gate commands from a future stage.

#### Scenario: Command from a future stage

- **WHEN** a line with command `lexforge check plan` shows up in a skill's body
- **THEN** the test fails and names the command and the file

#### Scenario: Description starts with the wrong word

- **WHEN** a skill's `description` does not start with the words `Use when`
- **THEN** the test fails and names the file

#### Scenario: Body exceeds the limit

- **WHEN** the body of `SKILL.md` is longer than its allotted size
- **THEN** the test fails and names the file and its length
