# cli-command-execution

## Purpose

This capability governs dispatch of the command the user originally asked LexForge to run. It preserves that request when the user decides to remain on the installed CLI version.

## Requirements

### Requirement: Continue after declining an update

The system SHALL execute the originally requested command in the current process when the user chooses to stay on the installed version.

#### Scenario: User stays on the installed version

- **WHEN** a newer npm release is available and the user chooses to stay on the installed version
- **THEN** the CLI dispatches the original command with its original arguments
