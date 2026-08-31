# platform-support Specification

## Purpose
Which systems the package's operation is confirmed on, what confirms it, and what a person
deciding whether to install LexForge is told about it.

## Requirements

### Requirement: A test suite run confirms three systems

The test suite SHALL run on Linux, macOS, and Windows, and on two Node versions: the minimum
from the `engines` field and the current LTS.

The run SHALL trigger on every push to the main branch and on every pull request.

A failing run on any of the systems SHALL count as grounds not to publish the version.

#### Scenario: Run on three systems

- **WHEN** a change is pushed to the main branch
- **THEN** the test suite passes on Linux, macOS, and Windows and leaves no failing file

### Requirement: The README names the confirmed systems

The README's requirements section SHALL name the systems the run confirms, instead of a caveat
about where development happened.

Both README languages SHALL carry this statement the same way.

#### Scenario: A reader picks a system

- **WHEN** a person opens the README's requirements section
- **THEN** they read which systems and Node versions the run confirms
