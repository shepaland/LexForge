# task-red-ledger

## Purpose

The record of one task's failing run: the command the CLI runs itself, what it refuses to
write down, and what stays on disk afterwards. A quoted failing line in an answer proves
nothing after the session ends, so the machine takes the record - it knows the exit code, the
commit, and the state of the tree at the moment the test failed.

## Requirements

### Requirement: The CLI runs the failing command and records it

The command `lexforge evidence red`, taking a change, a task id and a command, SHALL run
that command in the workspace root and SHALL write one record for that task.

The record SHALL hold: the command, the exit code, the start of the run in UTC ISO 8601, the
duration, the `HEAD` the tree stood on, the digest of the working tree, and the tail of the
combined output with a flag saying whether it was truncated.

The output tail SHALL be bounded in size the same way a label stamp's tail is bounded.

An agent SHALL NOT be able to write a record without the run: there SHALL be no flag that
takes a failing line, an exit code, or an output tail as an argument.

#### Scenario: A red run is recorded

- **WHEN** `evidence red --change add-auth --task 2.3 --command "pytest tests/test_login.py"`
  runs and the command exits `1`
- **THEN** the record for task 2.3 holds that command, exit code `1`, the failing tail, the
  `HEAD`, and the digest of the tree, and the command exits `0`

#### Scenario: No way to hand in a failure

- **WHEN** an agent looks for a way to record a failure it already saw in its own session
- **THEN** the command offers none: the only path to a record is a run the CLI performs

### Requirement: A green run is not a red record

A run that exits `0` SHALL NOT be recorded. The command SHALL exit `1`, SHALL say the run
came back green, and SHALL name the two lawful moves: rewrite the test so it asserts the
behaviour and run again, or drop the task.

A run that never started SHALL NOT be recorded either: a shell code that means the command
was not found SHALL exit `2` with the command quoted, the same as a label stamp's run.

#### Scenario: The test passes

- **WHEN** the command given to `evidence red` exits `0`
- **THEN** nothing is written, the exit code is `1`, and the answer says the test came back
  green

#### Scenario: The command does not exist

- **WHEN** the command given to `evidence red` cannot be started
- **THEN** the exit code is `2`, the command is quoted, and no record is written

### Requirement: One record per task, in the change directory

The records SHALL live in a file of their own inside the change directory, separate from
`evidence.json`.

A record SHALL be keyed by the task id as `tasks.md` writes it. Recording one task SHALL
leave every other task's record untouched, and a second record for the same task SHALL
replace the first.

A task id that `tasks.md` does not carry SHALL exit `2` and SHALL name the ids the plan
holds.

A broken records file SHALL stop the command with exit `2` and SHALL name the file, the same
way a broken stamp file does.

#### Scenario: Two tasks recorded in turn

- **WHEN** task 2.3 is recorded and then task 2.4 is recorded
- **THEN** the file holds both records, and the record of 2.3 is unchanged

#### Scenario: A task the plan does not hold

- **WHEN** `evidence red --task 9.1` runs against a plan whose last section is 4
- **THEN** the exit code is `2` and the answer lists the task ids the plan holds

#### Scenario: A task recorded twice

- **WHEN** task 2.3 is recorded, its test is rewritten, and task 2.3 is recorded again
- **THEN** the file holds one record for 2.3, the second one

### Requirement: A task's id and its red record survive the plan's split into files

Splitting the plan into an index and one file per section SHALL change nothing about a
task's own id: a task numbered `4.3` before the split is still numbered `4.3` after it,
wherever its section's file now lives.

The red-run store SHALL stay keyed by that same task id, unchanged by which file the
task's line now lives in: a record written for task `4.3` before the split still answers
for task `4.3` after it, and every gate that reads a ticked task - `verify`, `evidence
record`, the red-record dimension - SHALL find it through the same store key.

#### Scenario: A record survives its section's move to a file of its own

- **WHEN** task `4.3` has a red record, and section 4 is then moved out of `tasks.md` into
  a file of its own
- **THEN** `lexforge verify` still finds task `4.3`'s red record, keyed by `4.3`, unchanged
  by the move
