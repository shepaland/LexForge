# first-run Specification

## Purpose
The path from an empty repository to the first change set up: what a person installs and
runs, what shows up on disk along the way, and where the agent starts work.

## Requirements

### Requirement: The first run has four steps

The first run SHALL consist of installing the package, calling
`lexforge init --tools <list>`, calling `lexforge doctor`, and the user's request to the agent.

Every successful call SHALL name the next step: `init` names `lexforge doctor`, and
`doctor` with no findings names talking to the agent.

No step SHALL require hand-editing files: the workspace, the configuration, and the skills
all come from a command.

#### Scenario: The loop in an empty directory

- **WHEN** the package is installed into an empty directory and `lexforge init --tools
  claude` is called
- **THEN** `lexforge/config.yaml`, `lexforge/specs/`, `lexforge/changes/archive/`, and nine
  skill directories in `.claude/skills/` appear, and the output names `lexforge doctor`

#### Scenario: Work starts with a request

- **WHEN** the installation is checked and the user asks the agent to build something
- **THEN** the agent enters through the `lexforge` skill and sets up a change with the
  `lexforge new change` command

### Requirement: Init without a tool list names the runtimes it found

Calling `lexforge init` without the `--tools` flag SHALL set up the workspace and SHALL NOT
install skills.

Such a call SHALL name installing skills as the next step and SHALL list the names of the
tools whose directories already exist in the project or in the user's home directory.

Choosing the tool SHALL stay with the person: a directory being found doesn't grant the
right to write files into it.

#### Scenario: The project already has an agent directory

- **WHEN** the project holds `.claude/`, and `lexforge init` is called without a tool list
- **THEN** the workspace is set up, no skills are written, and `lexforge init --tools
  claude` is named as the next step

#### Scenario: No familiar directory at all

- **WHEN** none of the registry's directories exist in the project or the home directory
- **THEN** the next step named is installation with the list of known tool names

### Requirement: Init doesn't require a repository

The `lexforge init` command SHALL work in a directory with no git repository and SHALL NOT
create a repository, a branch, or a commit.

The missing repository SHALL be named in the output as a condition the `evidence record`,
`check evidence`, `verify`, and `archive` gates will need.

#### Scenario: A directory with no repository

- **WHEN** `lexforge init --tools claude` is called in a directory with no `.git`
- **THEN** the command exits with code `0`, no repository is created, and the output names
  the gates that will need it

### Requirement: Repeated init preserves the project's work

A repeated `lexforge init` SHALL preserve edits to `lexforge/config.yaml` and SHALL NOT
touch the `lexforge/changes/` and `lexforge/specs/` directories.

Existing files SHALL land in the output's unchanged section, so the difference between the
first call and a repeated one reads straight from the output.

#### Scenario: The configuration was edited

- **WHEN** a `verification` section is added to `config.yaml`, and `init` is called again
- **THEN** the section stays in place, the config path is named in the unchanged section

#### Scenario: A change is in progress

- **WHEN** an open change sits in `lexforge/changes/`, and `init` is called again
- **THEN** its files stay untouched

### Requirement: Installing into a clean directory is checked by an end-to-end run

The stage's readiness SHALL be checked by a run that builds the package archive, installs it
into an empty directory, and runs `lexforge init --tools claude`, `lexforge doctor`,
`lexforge new change <name>`, and `lexforge status --change <name> --json` there.

The run SHALL read the exit codes of all four calls and the directory contents on disk.

The loop of four zeros SHALL be checked on a project that sits in a git repository with a
commit and has named at least one label in the `verification` section: the init command creates
neither condition, and the installation check needs both. The run SHALL also check the state
right after installation, where there's no repository or labels yet: there the installation
check SHALL give code `1` and name both conditions.

Walking through this loop by hand SHALL NOT count as verification: the run that repeats on
any machine closes out the stage.

#### Scenario: The loop passes

- **WHEN** the run executes on the built archive in a git repository with a commit and a
  named `verification` label
- **THEN** all four calls exit with code `0`, and `status` returns a JSON document with the
  name of the change that was set up

#### Scenario: Checking right after installation

- **WHEN** the package is installed and init has run, and there's no repository or
  verification labels yet
- **THEN** the installation check exits with code `1` and names both conditions

#### Scenario: The package lost a file

- **WHEN** an artifact template drops out of the package contents
- **THEN** the run fails at the call that needed the template
