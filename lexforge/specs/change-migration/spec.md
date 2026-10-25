# change-migration

## Purpose

How a change started under LexForge 5.x continues under 6.0.0: every command stops on it until
it is migrated, migration keeps closed work as history and turns the rest into open tasks, and
the open part of the plan goes through review and approval like any new plan.

## Requirements

### Requirement: A 5.x change is refused until it is migrated

Every command that reads the state of a change SHALL refuse a change whose `workflow.json` has a
version below 3 with `change-needs-migration` and the next step
`lexforge migrate --change <name>`.

#### Scenario: Status on a 5.x change

- **WHEN** change `old` has `workflow.json` version 2 and `lexforge status --change old` runs
- **THEN** the command refuses with `change-needs-migration` and the next step
  `lexforge migrate --change old`

### Requirement: Migration keeps closed work as history and opens the rest

`lexforge migrate --change <name>` SHALL write `workflow.json` version 3. A ticked task whose
cycle is closed, or that has a record in `red-runs.json`, SHALL become a closed task record with
`origin: "historical"`. Every other task SHALL stay open, and its `Files:`, `Test:` and
`Command:` SHALL be filled from `execution-plan.json` where that file holds them. The answer
SHALL list in `missingFields` every open task still without `Files:`, `Test:` (except a `(move)`
task) or `Command:`. Closed tasks SHALL NOT be changed.

#### Scenario: Two closed tasks and one open

- **WHEN** tasks `1.1` and `1.2` are ticked with closed cycles and task `2.1` is open with its
  cycle in `execution-plan.json`
- **THEN** `1.1` and `1.2` become historical records, and `2.1` stays open with the fields from
  `execution-plan.json`

#### Scenario: A change without execution-plan.json

- **WHEN** the change has no `execution-plan.json` and task `4.1` is open
- **THEN** `missingFields` names `4.1` with `Files`, `Test` and `Command`

### Requirement: A migrated plan with open tasks passes review and approval

Migration SHALL record `migratedFrom: "5.x"` in the plan state. When no task is left open, it
SHALL record an approval with the quote "migrated from 5.x". When a task is left open, the plan
SHALL stay unapproved and the next step SHALL be
`lexforge plan review --change <name> --angle specs --file <report.md>`, preceded by an
instruction to add the missing fields when `missingFields` is not empty.

#### Scenario: Open tasks remain

- **WHEN** task `2.1` is open after migration
- **THEN** the answer holds `approved: false` and the next step names `lexforge plan review`

#### Scenario: Every task closed

- **WHEN** every task of the change became historical
- **THEN** the approval holds the quote "migrated from 5.x"

### Requirement: Migration runs once

A second `lexforge migrate --change <name>` on a migrated change SHALL refuse with
`already-migrated` and SHALL write nothing.

#### Scenario: A repeated run

- **WHEN** migrate runs twice on change `demo`
- **THEN** the second run refuses with `already-migrated` and no file of the change changes
