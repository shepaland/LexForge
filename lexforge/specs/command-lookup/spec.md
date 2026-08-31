# command-lookup

## Purpose

How `lexforge doctor` looks up a bare command name on PATH, and why that lookup works
differently on Windows. Read by whoever installed the package and got a finding that a command
is missing when it's actually installed.

## Requirements

### Requirement: PATH lookup follows the system's rules

The PATH command check SHALL find an installed command by its bare name on Linux, macOS, and
Windows.

On Windows, the lookup SHALL try each extension from the `PATHEXT` variable and SHALL treat as
found the first file whose name matches the command name plus one of these extensions. A
missing execute bit SHALL NOT be a reason to skip a file on this system.

On Linux and macOS, the lookup SHALL still require execute permission and SHALL NOT treat a
directory with a matching name as a command.

#### Scenario: An installed command on Windows

- **WHEN** a directory on PATH holds `lexforge.cmd`, and `PATHEXT` carries `.CMD`
- **THEN** the check calls the condition passed, not a `path-not-resolved` finding

#### Scenario: A file without execute permission on Linux

- **WHEN** a directory on PATH holds a file `lexforge` without the execute bit
- **THEN** the check doesn't treat it as a command and names the finding `path-not-resolved`

#### Scenario: A directory with the command's name

- **WHEN** a directory on PATH holds a directory named `lexforge`
- **THEN** the check doesn't treat it as a command
