# skill-version-gate

## Purpose

Keeps an agent from following skills of one LexForge release against the CLI of another. Every
workspace command checks the installed skill sets before it runs and refuses with the
`lexforge init` that brings them in line. The skills read the refusal by its error code.

## Requirements

### Requirement: Workspace commands refuse while an installed skill set carries another version

Before it runs, every command except `lexforge init`, `lexforge doctor`, `--help` and
`--version` SHALL look at each LexForge skill installation of every known tool, in the project
and in the home directory. A skills directory counts as a LexForge installation when the
manifest `lexforge-install.json` lies next to it or it holds a skill directory of the
`lexforge` name family. When the manifest of such an installation names a version other than
the running CLI, or the installation has no manifest, the command SHALL exit with code `2` and
the error code `skills-outdated`. Its message SHALL name the skills directory, the installed
version or its absence, the running version, and the command `lexforge init --tools <tool>`,
followed by `--scope user` for an installation in the home directory. The check SHALL read
local files only.

Interaction: agent -> cli, cli -> agent

```sequence
agent -> cli: workspace_command
cli -> agent: refusal
```

| Message | From | To | Field | Type | Required | Length | Response | Errors |
|---|---|---|---|---|---|---|---|---|
| workspace_command | agent | cli | command | string | yes | 1..16 | refusal | skills-outdated |
| refusal | cli | agent | error.code | string | yes | 1..32 | - | - |
| refusal | cli | agent | error.message | string | yes | 1..400 | - | - |

#### Scenario: Project skills from an older release

- **WHEN** `.claude/skills` in the project was installed by 3.0.0 and the running CLI is 4.0.0,
  and an agent runs `lexforge status --json`
- **THEN** the command exits with code `2`, `error.code` is `skills-outdated`, and
  `error.message` names `.claude/skills`, 3.0.0, 4.0.0 and `lexforge init --tools claude`

#### Scenario: User-scope skills from an older release

- **WHEN** `~/.claude/skills` was installed by 3.0.0 and the running CLI is 4.0.0
- **THEN** any workspace command in any project refuses with `skills-outdated` and the message
  names `lexforge init --tools claude --scope user`

#### Scenario: Skills newer than the CLI

- **WHEN** the project skills were installed by 4.0.0 and the running CLI is 3.0.0
- **THEN** the command refuses with `skills-outdated`

#### Scenario: Skills without a manifest

- **WHEN** `.claude/skills` holds `lexforge-plan` and no `lexforge-install.json` lies next to it
- **THEN** the command refuses with `skills-outdated` and the message says the installed
  version is unknown

#### Scenario: The repair commands run on outdated skills

- **WHEN** the project skills were installed by 3.0.0, the running CLI is 4.0.0, and
  `lexforge init --tools claude` or `lexforge doctor` is run
- **THEN** the command runs and is not refused with `skills-outdated`

#### Scenario: A directory with somebody else's skills

- **WHEN** `~/.claude/skills` holds only skills whose names are outside the `lexforge` family
  and no manifest
- **THEN** the directory is not checked and the command runs

#### Scenario: Matching versions

- **WHEN** every LexForge installation names the running version in its manifest
- **THEN** the command runs as it would without the check
