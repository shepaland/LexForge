# installation-health Specification

## Purpose
The `lexforge doctor` command: how it answers the question "is this installation healthy,"
what conditions it checks, what it does with findings, and what exit codes it returns.

## Requirements

### Requirement: The installation check command names each condition separately

The `lexforge doctor` command SHALL check six conditions and SHALL report the outcome for
each:

1. the `lexforge/` workspace is set up, and `config.yaml` reads;
2. the configuration's `verification` section carries at least one label;
3. the installed skills match what the package ships;
4. the name `lexforge` resolves on the current `PATH`;
5. the project sits in a git repository, and the repository has a commit;
6. the Node version matches the package's `engines` field.

A condition with no finding SHALL be named in the output the same way as one with a finding:
a person sees what was checked, not only what broke.

There SHALL NOT be a summary verdict without a breakdown by condition.

#### Scenario: A healthy installation

- **WHEN** all six conditions are met
- **THEN** the command lists all six conditions as passed and exits with code `0`

#### Scenario: Two conditions fail

- **WHEN** the `verification` section is empty and there is no repository
- **THEN** the output carries both findings and four passed conditions

### Requirement: Skills are compared against what's shipped byte for byte

The skill check SHALL read the install manifest of every tool whose directory is found in
the project or the home directory, and SHALL compare each named file against the package's file
byte for byte.

A LexForge install directory SHALL be one that holds an install manifest or a skill
directory from the `lexforge` family — `lexforge` and `lexforge-<step>`. A skill directory
holding only unrelated skills doesn't belong to the check and SHALL NOT produce a finding:
`~/.claude/skills` exists for anyone who uses an agent, and its presence says nothing about a
LexForge installation.

A content mismatch, a missing file, and a manifest version that differs from the package
version SHALL produce a finding with the file's path and the command that fixes it.

An installation with no manifest SHALL produce a finding with the tool's name: what's there
is unknown.

The command in a finding SHALL name the same scope the directory sits in: a user-scope
finding calling for a project install doesn't resolve the finding.

#### Scenario: A skill edited by hand

- **WHEN** an installed `SKILL.md` differs from what's shipped by one line
- **THEN** the finding names the file's path and the reinstall command

#### Scenario: The CLI version moved ahead

- **WHEN** the package is updated and the skills are left from the previous version
- **THEN** the finding names both versions and the reinstall command

#### Scenario: Skills were never installed

- **WHEN** none of the registry's skill directories exist in the project or the home
  directory
- **THEN** the finding names the install command with the tool list

#### Scenario: Unrelated skills in the agent's directory

- **WHEN** `~/.claude/skills` holds skills LexForge didn't install, and the project
  installation ran and is intact
- **THEN** there are no findings and the exit code is `0`

#### Scenario: A user-scope installation has drifted

- **WHEN** the user-scope skills diverge from what's shipped
- **THEN** the finding names the command with the scope flag: `lexforge init --tools <name>
  --scope user`

### Requirement: Checking the command name on PATH

The check SHALL look for an executable named `lexforge` in the `PATH` directories and SHALL
produce a finding when the name doesn't resolve.

The finding SHALL name the reason directly: skills call the command by its bare name, and
without it the queue rule stops work on the very first call.

A resolved name that leads to a different file than the one running now SHALL produce a
finding with both paths: two installations of different versions give different answers to one
question.

#### Scenario: The package sits only in the project's dependencies

- **WHEN** `lexforge` doesn't resolve on `PATH`
- **THEN** the finding names both legitimate installs: the global one and running through
  `npx`

#### Scenario: Two installations

- **WHEN** the name resolves to a file from a different installation
- **THEN** the finding names the path of the resolved file and the path of the one running

### Requirement: The check doesn't fix anything and doesn't run the project's checks

The command SHALL NOT write, delete, or overwrite files: it answers a question about state.

The command SHALL NOT run the commands in the `verification` section: `lexforge evidence
record` runs those, and swapping it out for a call to the install check would give a stamp with
no record behind it.

There SHALL NOT be a flag that fixes what's found: every finding carries the command a
person or an agent runs themselves.

#### Scenario: A run on a broken installation

- **WHEN** the check found a skill mismatch
- **THEN** the files on disk stay unchanged, and the finding names the reinstall command

#### Scenario: A verification label is described

- **WHEN** the `verification` section describes a `tests` label with a long-running command
- **THEN** the installation check doesn't run that command

### Requirement: Exit codes and the installation check's response

The command SHALL return `0` when there are no findings; `1` when at least one is found; `2`
when the call can't be parsed — an unknown flag or an extra argument.

A missing workspace, missing skills, missing repository, and missing verification labels
SHALL give code `1`: that's the state of the installation, not a refusal to run the command.

The `--json` response SHALL carry `outputVersion`, `version`, `workspaceRoot`, `checks`,
`findings`, `summary`, and `nextStep`. Each finding SHALL carry `rule`, `level`, `message`, and,
when it concerns a file, `path`.

#### Scenario: An empty project

- **WHEN** the command is called in a directory without `lexforge/`
- **THEN** exit code `1`, the finding names `lexforge init`

#### Scenario: An unknown flag

- **WHEN** the command is called with the flag `--fix`
- **THEN** exit code `2` and the command's help

#### Scenario: A response for a machine

- **WHEN** the command is called with `--json`
- **THEN** one JSON document with the listed fields goes to standard output
