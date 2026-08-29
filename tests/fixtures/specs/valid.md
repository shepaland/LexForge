## Purpose

Shows a delta spec the scanner reads without a single finding.

## ADDED Requirements

### Requirement: Change carries a delta spec

The system SHALL read the delta spec of the change.

#### Scenario: Delta spec is written

- **WHEN** the change directory holds one spec file
- **THEN** the scanner reports one requirement
