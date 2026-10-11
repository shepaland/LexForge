# cli-update-check

## Purpose

This capability warns interactive CLI users when npm has published a newer LexForge release. It gives the user control over whether to update immediately or run the requested command with the installed version.

## Requirements

### Requirement: Check the npm latest release before command execution

The system SHALL compare the running LexForge version with the `latest` version published for `lexforge` on npm before executing the requested CLI command.

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

