# change-journal

## Purpose

What a session keeps about a change beyond the plan: the owner's decisions in their own words,
open questions, the agent's promises, permissions with the scope they hold in, and the agent's
rulings with their reasons. `status` shows how far the plan has gone, and `resume` turns the
records and the journal into one next step after context compaction.

## Requirements

### Requirement: Owner decisions, questions, promises, permissions and rulings live in the change

`lexforge journal add --change <name> --kind <kind> --text <text>` SHALL add an entry with an id
`J1`, `J2` and onward to the journal of the change, for the kinds `decision`, `question`,
`promise`, `permission` and `ruling`. A `decision` and a `permission` SHALL carry `--quote` with
the owner's words and SHALL be refused with `quote-required` without it. A `ruling` SHALL carry
`--reason` and SHALL be refused with `reason-required` without it.
`lexforge journal resolve --change <name> --id <id> --note <text>` SHALL close an entry, and a
second resolve SHALL be refused with `entry-already-resolved`.

#### Scenario: An owner decision without a quote

- **WHEN** `journal add --kind decision --text "Keep merge --no-ff"` runs without `--quote`
- **THEN** the command refuses with `quote-required`

#### Scenario: A ruling of the agent

- **WHEN** the agent records `--kind ruling --text "Sort by title" --reason "the spec names no
  order"`
- **THEN** the entry is stored with its reason and stays until it is resolved

#### Scenario: A question answered

- **WHEN** question `J1` is resolved with the note "by title"
- **THEN** the entry holds the note, and a second resolve of `J1` refuses with
  `entry-already-resolved`

### Requirement: A permission acts only within its scope

A journal entry SHALL carry a scope: `task:<id>`, `change` or `session`, with `change` when no
scope is given. A `task:<id>` scope naming a task the plan lacks SHALL be refused with
`task-not-found`. A permission scoped to a task SHALL act until that task closes. A permission
scoped to the session SHALL act until `lexforge journal session --change <name>` opens the next
session, and a session scope before any session is open SHALL be refused with
`session-not-open` and the next step `lexforge journal session --change <name>`. Decisions,
questions, promises and rulings SHALL NOT expire; only a resolve closes them.

#### Scenario: A new session

- **WHEN** a permission was given with scope `session` and the next session opens
- **THEN** `journal session` names that permission as expired and it is no longer active

#### Scenario: A task permission after the task closed

- **WHEN** a permission scoped to `task:1.1` exists and task `1.1` is closed
- **THEN** the permission is no longer active

### Requirement: Status reports progress by plan and by section

`lexforge status --change <name>` SHALL report for the whole plan and for each section the
number of tasks, closed tasks, tasks in progress, waiting tasks and blocked tasks. A task SHALL
be in progress while its record has an executor and is not closed; an abandoned task SHALL NOT
count as in progress. A task SHALL be waiting while a task or section it depends on is not
closed, and blocked when a task it depends on was abandoned twice or more; a blocked task SHALL
NOT count as waiting, and a ready task counts as neither. The text output SHALL show the share of closed tasks as a whole percent
rounded down and the number of tasks in progress.

#### Scenario: A dependency abandoned twice

- **WHEN** task `1.2` was abandoned twice and both tasks of section 2 depend on section 1
- **THEN** status shows `Waiting: 0, blocked: 2`

#### Scenario: One task closed out of four

- **WHEN** section 1 has task `1.1` closed and `1.2` in progress, and section 2 with
  `Depends on: 1` has two tasks
- **THEN** status shows `Tasks: 1/4 closed (25%)`, `Running: 1` and `Waiting: 2, blocked: 0`

### Requirement: Resume names the next step and the standing journal

`lexforge resume --change <name>` SHALL answer with the progress, the tasks in progress with the
step each one needs next, one next step as a command, the owner's decisions with their quotes,
the open questions, the unresolved promises, the active permissions and the rulings. The next
step SHALL follow this order: an open question, missing plan reviews, a missing approval, an
unreviewed amendment, a task in progress, a ready task, a missing final review, then
`lexforge verify --change <name>`. On a short change the steps of plan review and approval SHALL
be skipped.

#### Scenario: An open question comes first

- **WHEN** question `J1` is open and task `1.2` is ready
- **THEN** the next step asks the owner question `J1` and names
  `lexforge journal resolve --change demo --id J1`

#### Scenario: A task waits for green

- **WHEN** task `1.1` has a red run and no green run
- **THEN** the next step is `commit the implementation, then run: lexforge task green --change
  demo --task 1.1`

#### Scenario: Expired permissions are left out

- **WHEN** the journal holds a change permission, a permission of a closed task and a permission
  of an earlier session
- **THEN** resume lists only the change permission
