## REMOVED Requirements

### Requirement: Gone without a reason

The system SHALL no longer run the old command.

**Migration**: callers move to `lexforge validate`.

#### Scenario: Old command is gone

- **WHEN** the caller runs the old command
- **THEN** the command reports that it was removed

### Requirement: Gone without a migration

The system SHALL no longer run the second old command.

**Reason**: the command was folded into `lexforge status`.

#### Scenario: Second command is gone

- **WHEN** the caller runs the second old command
- **THEN** the command reports that it was removed
