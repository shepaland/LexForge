# completion-verify

## Purpose

The machine part of the check before work is declared done. An agent who has reached the end of
the task list judges its own work, and judges it generously: an open checkbox gets explained
away as a minor thing, a requirement with no implementation gets explained as "covered by the
neighboring one." This spec records what `verify` measures on its own, what counts as proof a
requirement left a trace in the code, and where the line sits that a machine does not cross.

## Requirements

### Requirement: An open task is a finding

`verify` SHALL report a finding for every `- [ ]` checkbox in `tasks.md`. The finding text SHALL
carry the task number, its first line, and the file's line number.

A `- [x]` checkbox in any case SHALL count as closed.

A missing `tasks.md` on a change whose plan artifact is not marked skipped SHALL give code `2`:
there is nothing to check, and code `0` here would mean "no tasks left."

#### Scenario: Two open tasks

- **WHEN** `tasks.md` still has `- [ ] 4.2` and `- [ ] 7.1`
- **THEN** the response carries two findings with task numbers and line numbers

#### Scenario: No plan

- **WHEN** `verify` is called on a change with no `tasks.md` written
- **THEN** the command exits with code `2` and names
  `lexforge instructions tasks --change <name>`

#### Scenario: Uppercase mark

- **WHEN** a task is marked `- [X] 1.1`
- **THEN** the task counts as closed

### Requirement: A requirement's trace is found through tasks and changed files

`verify` SHALL treat a delta requirement as having a trace in the code when both conditions
hold:

- at least one plan task references the requirement, and every referencing task is closed;
- at least one file named in the `Files:` line of those tasks is changed in the change relative
  to the comparison base.

A requirement that fails either condition SHALL become a finding naming the capability and the
requirement name.

The requirement's text SHALL NOT be searched for in source files: a requirement's wording turns
up in code by coincidence, and such a search gives a green answer out of nothing.

The comparison base SHALL be the base recorded when the plan was approved, or
`git merge-base dev feature/<name>` for a change migrated from 5.x. Everything changed after
that counts as this change's work.

#### Scenario: Requirement covered by a closed task and an edited file

- **WHEN** a requirement is named by task `3.4`, the task is closed, and a file from its
  `Files:` line is changed relative to the comparison base
- **THEN** there is no finding

#### Scenario: Task closed, file untouched

- **WHEN** a task referencing a requirement is marked closed, but none of the files in its
  `Files:` line is changed relative to the comparison base
- **THEN** the check reports a finding naming the requirement and the file the edit never
  touched

#### Scenario: Requirement's wording turns up in the code

- **WHEN** the requirement's name appears verbatim in a source-file comment, but no task
  references the requirement
- **THEN** the check reports a finding: a text match does not count as a trace

#### Scenario: Change with no delta specs

- **WHEN** the change's delta-spec artifact is declared skipped
- **THEN** the trace dimension gives no findings

### Requirement: Stamps are read, verification commands are not run

`verify` SHALL read `evidence.json` and judge freshness by the rules of the `evidence-freshness`
capability for every label in the `verification` section.

`verify` SHALL NOT run verification commands: a long run inside a gate turns the check before
completion into the thing that gets put off. Taking a stamp stays the job of `evidence record`.

A label in any state other than `fresh` SHALL become a finding naming the label, its state, and
the command to take a stamp.

#### Scenario: Label never run

- **WHEN** the `verification` section describes the `lint` label, and there is no stamp for it
- **THEN** the check reports a finding naming
  `lexforge evidence record --change <name> --label lint`

#### Scenario: Tests are not run again

- **WHEN** `verify` runs on a change with a fresh stamp for the `tests` label
- **THEN** the label's command does not run, and its stamp is read from the ledger

### Requirement: No check runs without described checks

`verify` SHALL exit with code `2` when the `verification` section of `lexforge/config.yaml` is
empty or absent.

A project with no described checks has nothing to confirm with, and code `0` here would read to
a skill as proof of readiness.

#### Scenario: No checks in the project

- **WHEN** `verify` is called in a project with no `verification` section
- **THEN** the command exits with code `2` and prints an example section with the `tests` and
  `lint` labels

### Requirement: The response names the boundary of the machine check

The `verify` response SHALL carry a list of what the machine did not check: whether the
implementation matches the decisions in `design.md`, whether the requirements themselves are
complete, code quality.

A skill reading code `0` SHALL get a direct pointer from the response to the work still left.
Without it, a zero exit code reads as a full check, and the text part of the check gets skipped.

#### Scenario: Clean response names the remainder

- **WHEN** `verify` exits with code `0`
- **THEN** the response carries the list of what was not checked, and it names `design.md`

#### Scenario: Remainder list in machine output

- **WHEN** `verify --change add-auth --json` is run
- **THEN** the JSON document carries the same list in its own field

### Requirement: verify's machine output is usable by a skill

`verify --json` SHALL print a single document to standard output and nothing else. The document
SHALL carry findings in the shared gate shape and a count for each dimension that
`lexforge verify` checks.

A skill SHALL decide from the exit code and the document's fields, without parsing
human-readable strings.

#### Scenario: Counts by dimension

- **WHEN** `verify --json` finds two open tasks, one stale label and one open ledger entry above
  MINOR
- **THEN** the document carries a count of `2` for tasks, `1` for stamps, `1` for open defects
  and `0` for every other dimension

#### Scenario: Standard output parses whole

- **WHEN** `verify --change add-auth --json` is run
- **THEN** the whole standard output parses as JSON with no pre-cleaning

### Requirement: A ticked task without a closed task record is a finding

`lexforge verify --change <name>` SHALL report `ticked-task-without-record` for a ticked task
with no task record, and `task-record-not-closed` for a ticked task whose record is not closed.
A historical record SHALL count as closed.

#### Scenario: A checkbox ticked by hand

- **WHEN** task `1.2` is ticked in `tasks.md` and has no task record
- **THEN** verify reports `ticked-task-without-record` on task `1.2`

#### Scenario: A migrated task

- **WHEN** task `1.1` is ticked and its record has `origin: "historical"`
- **THEN** the task adds no finding

### Requirement: A recorded commit missing from history is a finding

For every native task record, the red commit, the green commit and the merge commit SHALL be
ancestors of the change branch. `lexforge verify --change <name>` SHALL report
`recorded-commit-missing` for each one that is not.

#### Scenario: The change branch rewritten

- **WHEN** the change branch was rewritten and the merge commit of task `1.1` is gone from it
- **THEN** verify reports `recorded-commit-missing` on task `1.1`

### Requirement: A change without an approved final review is a finding

After the last task closes, the diff of the whole change SHALL be reviewed and registered with
`lexforge review final --change <name> --file <report.md>`; the command SHALL refuse with
`tasks-open` while a task is open and with `reviewer-is-executor` when the reviewer executed a
task of the change. The base of the review SHALL be the base of the approval, or
`git merge-base dev feature/<name>` for a change migrated from 5.x. `lexforge verify` SHALL
report `final-review-missing` without a registered final review, `final-review-stale` when the
change branch moved past the reviewed commit, and `final-review-findings-open` when the latest
final review holds a critical or important finding.

#### Scenario: No final review

- **WHEN** every task is closed and no final review is registered
- **THEN** verify reports `final-review-missing`

#### Scenario: A commit after the final review

- **WHEN** a commit lands on the change branch after the final review
- **THEN** verify reports `final-review-stale`

#### Scenario: A blocking finding in the final review

- **WHEN** the latest final review holds a critical finding
- **THEN** verify reports `final-review-findings-open`

### Requirement: verify checks every dimension in one response

`lexforge verify --change <name>` SHALL check these things in a single call and fold the
findings into one list:

- open checkboxes in `tasks.md`;
- ticked tasks without a closed task record;
- closed task records whose green commit carries no approving review;
- recorded task commits missing from the history of the change branch;
- delta-spec requirements with no trace in the code;
- stamp state for every label in the `verification` section;
- open ledger entries of level `critical` or `important` naming this change;
- work the working tree holds that no commit of the change branch does, anywhere but the
  change directory - its delta specs excepted, because archive merges those into the main
  specs - the task worktrees, and the defect ledger with the lock and temporary files kept
  beside it;
- a change on the short path still fitting it, with its delta written before the code;
- the final review of the whole change.

The dimensions SHALL NOT be toggled off by flags and SHALL NOT be called separately: the
check before completion runs as a whole, or the agent picks the one dimension that passes.

Every finding SHALL carry a rule id that shows which dimension it came from.

#### Scenario: Three dimensions failing in one answer

- **WHEN** `verify` runs on a change with one open checkbox, one ticked task without a task
  record, and a stale stamp
- **THEN** one response carries all three findings, and the exit code is `1`

#### Scenario: No flag narrows the check

- **WHEN** an agent looks for a way to run one dimension on its own
- **THEN** no such flag exists, and the whole check runs

#### Scenario: Every dimension clean

- **WHEN** the tasks are closed with closed task records, every recorded commit is in the
  history of the change branch, every requirement has a trace, every label is fresh, the ledger
  holds no open entry above MINOR for this change, and an approved final review covers the tip
  of the change branch
- **THEN** the command exits with code `0`

#### Scenario: Work the working tree holds and no commit does

- **WHEN** every other dimension is clean and the working tree holds an edit to a source file
  that no commit of the change branch carries
- **THEN** the response carries one finding with the rule id `uncommitted-work` naming that
  file, and the exit code is `1`

#### Scenario: An uncommitted delta spec of the change

- **WHEN** every other dimension is clean and the only file the working tree holds and no
  commit does is a delta spec under the change's own `specs/`
- **THEN** the response still carries the `uncommitted-work` finding, because archive merges
  that file into the main specs

#### Scenario: An open ledger entry above MINOR

- **WHEN** every other dimension is clean and the ledger holds one open `critical` entry for
  this change
- **THEN** the response carries one finding with the ledger's rule id, exit code `1`

### Requirement: Final verification accepts historical task records

For a change migrated from 5.x, `lexforge verify` SHALL accept a historical task record as a
closed task without a red or green run, and SHALL require for it the same final review of the
current code as for a native change. A ticked task with neither a historical nor a native closed
record SHALL be a finding. A change with `workflow.json` below version 3 SHALL be refused with
`change-needs-migration`.

#### Scenario: Historical tasks with a final review of the tip

- **WHEN** all tasks are historical or natively closed and the final review covers the present
  tip of the change branch
- **THEN** the historical records add no finding to final verification

#### Scenario: Historical tasks with a final review left behind

- **WHEN** all tasks are historical but the change branch moved after the final review
- **THEN** final verification reports `final-review-stale` and keeps the historical tasks closed

#### Scenario: A ticked migrated task without a record

- **WHEN** a ticked task of a migrated change has no task record
- **THEN** final verification reports `ticked-task-without-record` and does not treat the
  checkbox as closed

#### Scenario: A change below workflow version 3

- **WHEN** verify runs on a change with `workflow.json` version 2
- **THEN** it refuses with `change-needs-migration` and the next step
  `lexforge migrate --change <name>`

