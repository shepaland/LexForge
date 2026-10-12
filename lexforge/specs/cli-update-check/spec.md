# cli-update-check

## Purpose

This capability warns interactive CLI users when npm has published a newer LexForge release. It gives the user control over whether to update immediately or run the requested command with the installed version.

## Requirements

### Requirement: Check the npm latest release before command execution

The system SHALL compare the running LexForge version with the `latest` version published for
`lexforge` on npm before executing the requested CLI command, when both standard input and
standard output are a terminal and the call does not carry `--json`.

#### Scenario: Installed version is current

- **WHEN** npm reports a `latest` version that is not newer than the running version
- **THEN** the CLI proceeds to the requested command without presenting an update choice

#### Scenario: A newer release exists

- **WHEN** npm reports a `latest` version newer than the running version
- **THEN** the CLI presents choices to update or stay on the installed version before dispatching the requested command

### Requirement: Install the selected npm update

The system SHALL run `npm install -g lexforge@latest` when the user chooses to update.

#### Scenario: Global update succeeds

- **WHEN** the user chooses to update and the npm global installation succeeds
- **THEN** the CLI does not execute the original command in the old process and tells the user to repeat that command with the updated executable

### Requirement: A non-interactive new change refuses while npm holds a newer release

`lexforge new change` run without a terminal on standard input or standard output, or run with
`--json`, SHALL ask npm for the `latest` version of `lexforge` before it creates anything. When
that version is newer than the running one, the command SHALL exit with code `2` and the error
code `update-available`, and its message SHALL name both versions and the command
`npm install -g lexforge@latest`. When npm does not answer within 3 seconds, answers with an
error, or answers without a version, the command SHALL go on as if no newer release existed.

Interaction: agent -> cli, cli -> registry, registry -> cli, cli -> agent

```sequence
agent -> cli: new_change
cli -> registry: latest_request
registry -> cli: latest_version
cli -> agent: refusal
```

| Message | From | To | Field | Type | Required | Length | Response | Errors |
|---|---|---|---|---|---|---|---|---|
| new_change | agent | cli | json | boolean | no |  | refusal | update-available |
| latest_request | cli | registry | package | string | yes | 8..8 | latest_version | - |
| latest_version | registry | cli | version | string | yes | 5..64 | - | - |
| refusal | cli | agent | error.code | string | yes | 1..32 | - | - |
| refusal | cli | agent | error.message | string | yes | 1..400 | - | - |

#### Scenario: A newer release on npm

- **WHEN** an agent runs `lexforge new change add-auth --json` with 3.0.0 installed and npm
  reporting 4.0.0
- **THEN** the command exits with code `2`, `error.code` is `update-available`,
  `error.message` names 3.0.0, 4.0.0 and `npm install -g lexforge@latest`, and neither the
  change directory nor the branch `feature/add-auth` is created

#### Scenario: The registry does not answer

- **WHEN** the npm registry gives no answer within 3 seconds
- **THEN** the change is created as it would be without the check

#### Scenario: npm holds no newer release

- **WHEN** npm reports a `latest` version equal to the running one
- **THEN** the change is created and no refusal is printed

#### Scenario: A terminal call with --json

- **WHEN** a person runs `lexforge new change add-auth --json` in a terminal while npm holds a
  newer release
- **THEN** no update question is asked and the command refuses with `update-available`
