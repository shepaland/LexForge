# task-execution

## Purpose

How one task of an approved plan is carried out: what a task declares, where its work happens,
how its red and green runs are bound to commits, who reviews it, and what the CLI checks in git
before it ticks the task and merges it. The session, the executor and the reviewer read the
answers of these commands; none of them edits a state file by hand.

## Requirements

### Requirement: A task is one item of the plan with its own contract

A task SHALL be one `- [ ] <id>` item of `tasks.md` (or of a section file the plan links to)
followed by continuation lines with its fields. `Files:` and `Command:` SHALL be required on
every task, `Test:` SHALL be required on every task except one declared `(move)`, and
`Depends on:` and `Controls:` SHALL be optional. `Files:` and `Test:` hold backtick paths
relative to the workspace root, `Command:` holds one backtick command, `Depends on:` holds task
ids, and `Controls:` holds names from `authorization`, `cryptography`, `tenant-isolation` and
`migrations`.

The steps "write a failing test", "see it fail" and "implement" SHALL be one task, not three.

#### Scenario: A task with every field

- **WHEN** task `2.1` carries `Files: `src/notes.js`, `test/notes.test.js``,
  `Test: `test/notes.test.js``, `Command: `npm test -- test/notes.test.js``,
  `Depends on: 1.2` and `Controls: migrations`
- **THEN** the task's files, tests, command, dependencies and controls are read from those lines

#### Scenario: A task without a command

- **WHEN** task `2.2` carries `Files:` and `Test:` but no `Command:`
- **THEN** `lexforge check plan --change <name>` reports a finding on task `2.2` and exits `1`

### Requirement: Starting a task opens a worktree and writes a brief

`lexforge task start --change <name> --task <id> --executor <id>` SHALL create a worktree at
`.lexforge/worktrees/<change>/<task-id>` with the branch `lexforge/<change>/<task-id>` from the
current tip of the change branch, and SHALL record that tip as the base of the task. It SHALL
write the brief to `lexforge/changes/<name>/tasks/<id>/brief.md` with the text of the task, the
requirements and scenarios it traces to, the decisions of `design.md` that concern it, the
engineering rules selected for its files, its command and the path of its worktree.

When `lexforge/config.yaml` sets `worktree.setup`, that command SHALL run in the new worktree;
a non-zero exit SHALL remove the worktree and refuse with `worktree-setup-failed` and the tail
of its output. `task start` SHALL hide its `.lexforge/` through `.git/info/exclude`, and SHALL
NOT edit the project's `.gitignore`. The line it writes SHALL hide the `.lexforge/` of the workspace it
was run for, whether that workspace is the top of its repository or a directory below it, and
SHALL leave a `.lexforge/` the workspace does not own alone.

#### Scenario: The first task of an approved plan

- **WHEN** the plan of change `demo` is approved and `lexforge task start --change demo
  --task 1.1 --executor exec-1` runs
- **THEN** the worktree and branch of task `1.1` exist, the brief names the worktree path and the
  command, and `nextStep` tells the executor to commit the test alone and run
  `lexforge task red --change demo --task 1.1`

#### Scenario: A workspace below the root of its repository

- **WHEN** the line `task start` wrote stands in the exclude file of a repository whose
  workspace sits below its top
- **THEN** `git status` in that workspace reports nothing under its `.lexforge/`, and a
  `.lexforge/` belonging to another workspace of the same repository is still reported

#### Scenario: Setup fails in the new worktree

- **WHEN** `worktree.setup` is `npm ci` and it exits `1` in the new worktree
- **THEN** the command refuses with `worktree-setup-failed`, the worktree is gone, and the task
  is not in progress

### Requirement: Independent tasks run in parallel in separate worktrees

`task start` SHALL refuse with `task-dependencies-open` while a task named in the task's
`Depends on:`, or a section named in its section's `Depends on:`, is not closed. It SHALL
refuse with `task-files-overlap` while one of its files or tests is a file or test of a task in
progress. It SHALL refuse with `task-already-started` for a task in progress or closed. Two
tasks that pass these checks SHALL run at the same time, each in its own worktree.

#### Scenario: A dependency is open

- **WHEN** task `1.2` says `Depends on: 1.1` and task `1.1` is not closed
- **THEN** `task start` for `1.2` refuses with `task-dependencies-open` and the next step
  `lexforge task start --change demo --task 1.1 --executor <id>`

#### Scenario: Files overlap a running task

- **WHEN** task `2.1` is in progress and task `3.1` names a file `2.1` also names
- **THEN** `task start` for `3.1` refuses with `task-files-overlap` and names the file

#### Scenario: Two independent tasks

- **WHEN** tasks `2.1` and `3.1` have closed dependencies and no shared file
- **THEN** both start, each in its own worktree on its own branch

### Requirement: The red run is taken on a commit that holds tests only

`lexforge task red --change <name> --task <id>` SHALL run the task's `Command:` in the task
worktree on its current commit and SHALL record the commit, the exit code, the tail of the
output and the full log. It SHALL refuse with `worktree-dirty` while the worktree has
uncommitted changes, and with `red-commit-touches-code` when the diff from the task base to that
commit touches a file outside the task's `Test:`.

A non-zero exit SHALL count as red unless the output shows an infrastructure error; a run that
shows one SHALL be refused with `red-run-broken`, and its next step SHALL name `worktree.setup`.
A zero exit SHALL be refused with `red-run-passed`.

#### Scenario: A failing assertion on the test commit

- **WHEN** the executor commits only `test/notes.test.js` and the command exits `1` on an
  assertion
- **THEN** the red run is recorded with that commit, and `nextStep` tells the executor to commit
  the implementation and run `lexforge task green --change demo --task 1.1`

#### Scenario: The red commit also holds code

- **WHEN** the commit holds the test and `src/notes.js`
- **THEN** `task red` refuses with `red-commit-touches-code` and records nothing

#### Scenario: A fresh worktree without dependencies

- **WHEN** the command fails because `node_modules` is missing in the worktree
- **THEN** `task red` refuses with `red-run-broken` and the next step names `worktree.setup`

### Requirement: A missing new module counts as red

A red run whose output shows `Cannot find module` or `error TS` SHALL be accepted as red when
the error names a file that does not exist at the task base and that the task declares in
`Files:`. Any other infrastructure error SHALL NOT count as red.

#### Scenario: The module the task creates

- **WHEN** the test imports `src/search.js`, the file is absent at the base, the task declares it
  in `Files:`, and the run fails with `Cannot find module` naming it
- **THEN** the red run is recorded

#### Scenario: A module the task does not declare

- **WHEN** the run fails with `Cannot find module` naming a file outside the task's `Files:`
- **THEN** `task red` refuses with `red-run-broken`

### Requirement: The green run is taken after the implementation commit

`lexforge task green --change <name> --task <id>` SHALL refuse with `red-missing` when the task
has no red run, with `test-changed-after-red` when the diff from the red commit to the current
commit touches a file of `Test:`, with `executor-report-missing` while
`lexforge/changes/<name>/tasks/<id>/report.md` is absent, and with `green-run-failed` when the
command exits non-zero. On exit `0` it SHALL record the green run and write the review package
`tasks/<id>/review.md`: the link to the brief, the executor's report, and the diff from the
task base to the green commit.

#### Scenario: The test edited after red

- **WHEN** the executor changes `test/notes.test.js` in the implementation commit
- **THEN** `task green` refuses with `test-changed-after-red` and the next step
  `lexforge task red --change demo --task 1.1`

#### Scenario: No executor report

- **WHEN** the implementation is committed and `tasks/1.1/report.md` is absent
- **THEN** `task green` refuses with `executor-report-missing` and the next step names the report
  path and `lexforge task green --change demo --task 1.1`

#### Scenario: The run passes

- **WHEN** the red run exists, the test is unchanged since it, the report exists and the command
  exits `0`
- **THEN** the green run is recorded and the review package holds the report and the diff

### Requirement: A move task needs no red

A task declared `(move)` right after its id SHALL pass `task green` without a red run.
`task red` on such a task SHALL refuse with `move-task-needs-no-red` and the next step
`lexforge task green --change <name> --task <id>`. The file checks of `task close` SHALL apply
to it as to every task.

#### Scenario: A file split

- **WHEN** task `6.1` is declared `(move)` and the regression command exits `0`
- **THEN** `task green` records the green run without a red one

### Requirement: A review is registered by its reviewer after green

`lexforge task review --change <name> --task <id> --file <report.md>` SHALL record the
reviewer, the verdict, the findings and the green commit the review saw. It SHALL refuse with
`reviewer-is-executor` when the reviewer is the executor of the task, with `green-missing` when
the task has no green run, and with `control-not-confirmed` when the task carries a control the
report does not confirm.

A report registered on a task already closed SHALL be recorded against that task's green commit
and SHALL leave the task closed. When such a report asks for changes, its `nextStep` SHALL name
both the fix task, added through `lexforge plan amend --quote` with the owner's words, and the
second review that clears the finding: once the fix task closes,
`lexforge/changes/<name>/tasks/<id>/review.md` goes to a reviewer again and
`lexforge task review` registers the answer. `lexforge verify` SHALL go on reporting that task
as unreviewed until an approving report covers its green commit.

#### Scenario: An approved review

- **WHEN** reviewer `rev-1` registers an approving report after the green run of task `1.1`
- **THEN** the review is recorded and `nextStep` is `lexforge task close --change demo --task 1.1`

#### Scenario: The executor reviews its own task

- **WHEN** the report names `exec-1`, the executor of the task
- **THEN** the command refuses with `reviewer-is-executor`

#### Scenario: A control left unconfirmed

- **WHEN** the task carries `Controls: migrations` and the report does not confirm `migrations`
- **THEN** the command refuses with `control-not-confirmed` and names `migrations`

#### Scenario: Changes requested on a closed task

- **WHEN** reviewer `rev-late` registers a report with an important finding on task `1.2`, which
  is already closed
- **THEN** the review is recorded, the task stays closed, and `nextStep` names the fix task
  through `lexforge plan amend` and, once it closes, the second review of
  `lexforge/changes/demo/tasks/1.2/review.md` through `lexforge task review`, while
  `lexforge verify` still reports task `1.2` as unreviewed

### Requirement: Closing a task checks the result in git and merges it

`lexforge task close --change <name> --task <id>` SHALL refuse with
`change-branch-not-checked-out` unless the main worktree is on the change branch and clean
outside `lexforge/changes/<name>/`. It SHALL then check, in order: the red commit is an
ancestor of the task branch tip (`red-not-ancestor`); the diff from the base to the red commit
touches only the task's tests (`code-before-red`); the diff from the red commit to the tip does
not touch the tests (`test-changed-after-red`); every file of the diff from the base to the tip
is declared by the task (`undeclared-file`); the latest review approves the recorded green
commit and its reviewer is not the executor (`review-stale`); the latest review holds no
critical or important finding (`findings-open`).

When every check passes it SHALL merge the task branch into the change branch, tick the task in
`tasks.md`, remove the worktree and the task branch, and record the merge commit. A merge
conflict SHALL refuse with `merge-conflict`, name the conflicting files, and leave the task
unticked.

#### Scenario: A clean close

- **WHEN** every check passes for task `1.1`
- **THEN** the task branch is merged, `- [x] 1.1` is written, the worktree is gone, and `nextStep`
  names the next ready task as `lexforge task start --change demo --task 1.2 --executor <id>`

#### Scenario: History rewritten after red

- **WHEN** the red commit is no longer an ancestor of the task branch tip
- **THEN** `task close` refuses with `red-not-ancestor` and merges nothing

#### Scenario: A conflict on merge

- **WHEN** merging the task branch conflicts on `src/notes.js`
- **THEN** `task close` refuses with `merge-conflict`, names `src/notes.js`, and the task stays
  unticked

### Requirement: An abandoned task starts over from the change branch

`lexforge task abandon --change <name> --task <id>` SHALL remove the task's worktree and branch,
clear its runs, reviews and executor, and add one to its count of attempts.

#### Scenario: A task abandoned once

- **WHEN** task `1.1` is in progress and `task abandon` runs
- **THEN** the worktree and branch are gone, the record shows `attempts: 1`, and `nextStep` is
  `lexforge task start --change demo --task 1.1 --executor <id>`

### Requirement: The change lock names its owner

Every command that writes the state of a change SHALL hold `lexforge/changes/<name>/change.lock` while
it writes, and the lock SHALL hold the pid of its process, the start time and the command. A
lock whose process is alive SHALL refuse with `change-locked`. A lock whose process is dead SHALL
refuse with `stale-lock` and the next step `lexforge unlock --change <name>`. The lock SHALL NOT
be held while the task's `Command:` runs in `task red` or `task green`, nor while `worktree.setup`
runs in `task start`.

#### Scenario: A process killed mid-write

- **WHEN** a `task close` process was killed and its lock remains
- **THEN** the next command refuses with `stale-lock` and names `lexforge unlock --change demo`,
  and no state file is left half written

### Requirement: Every refusal names the next step

Every refusal of `task start`, `task red`, `task green`, `task review`, `task close` and
`task abandon` SHALL carry `error.code`, `error.message` and a non-empty `nextStep` holding a
command, and SHALL exit with code `2`. No next step SHALL ask for a state file to be edited by
hand.

#### Scenario: Any refusal of a task command

- **WHEN** any task command refuses
- **THEN** its `nextStep` starts with `lexforge `, `git `, or names a file to write followed by
  `run: lexforge `
