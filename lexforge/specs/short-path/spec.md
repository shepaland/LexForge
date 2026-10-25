# short-path

## Purpose

A small fix that does not need a reviewed and approved plan. The short path keeps the spec
before the code and the red run before the fix, and stops being available as soon as the change
grows beyond one task.

## Requirements

### Requirement: A short change skips plan review and approval

`lexforge new change <name> --short` SHALL create a change whose `workflow.json` holds
`path: "short"`. On such a change `task start` SHALL NOT require plan reviews or an approval.

#### Scenario: A one-line fix

- **WHEN** `new change fix --short` runs and the plan holds one task with its fields
- **THEN** `task start --change fix --task 1.1 --executor exec-1` opens the task without
  `plan approve`

### Requirement: The short path is limited to one task with no new capability and no data

On a short change, `task start` and `task red` SHALL check that the plan holds one task, that the
spec deltas add no new capability, and that no task carries `Controls: migrations`. When a check
fails they SHALL refuse with `short-path-not-eligible`, name every reason, and give the next step
`lexforge plan escalate --change <name>`. `lexforge plan escalate --change <name>` SHALL write
`path: "full"`, keep closed tasks closed and give the next step
`lexforge plan review --change <name> --angle specs --file <report.md>`; it SHALL refuse with
`already-full-path` on a full change and with `task-in-progress` while a task is started and not
closed.

#### Scenario: The fix grew a second task

- **WHEN** a short change gains task `1.2` and `task start` runs
- **THEN** the command refuses with `short-path-not-eligible` and the next step
  `lexforge plan escalate --change fix`

#### Scenario: Escalation with a running task

- **WHEN** task `1.1` of a short change is in progress and `plan escalate` runs
- **THEN** the command refuses with `task-in-progress` and the next step
  `lexforge task abandon --change fix --task 1.1`

### Requirement: Specs come before code on the short path too

On a short change, `task red` SHALL refuse with `specs-before-code` and the next step
`lexforge validate <name> --strict` while `validate --strict` reports a finding, unless the
change carries `skip_specs: true`.

#### Scenario: A fix without its delta

- **WHEN** the spec delta of a short change fails `validate --strict` and the change does not
  carry `skip_specs: true`
- **THEN** `task red` refuses with `specs-before-code` and records nothing

#### Scenario: The delta of a short change reaches the main specs

- **WHEN** the one task of a short change is closed and `lexforge archive fix` runs
- **THEN** its spec delta is merged into `lexforge/specs/` as for a change on the full path

#### Scenario: A refactoring that changes no behaviour

- **WHEN** the short change carries `skip_specs: true`
- **THEN** `task red` runs without the spec check
