# Changelog

Entries run from the newest release to the oldest. Every entry names its version, its date
and what changed, and contract changes are listed apart from the rest: a renamed JSON field
or a moved exit code is what makes a caller rewrite its calls.

Versioning follows what a caller would break on, not calendar time. A change to the JSON
contract — a renamed or removed field of a `--json` answer, or a moved exit code — raises the
major number. A new command or flag raises the minor number. A wording change to a skill,
a template or a message printed to a person raises the patch number.

The owner may keep a contract change on the minor number, and `1.3.0` is such a release: it
removed the `role` field. The skills and the CLI ship in one package and are upgraded
together, so the caller that breaks on a change like this is a skill installed from an
earlier version, not somebody's own code. Two things hold whichever number a release gets:
the entry lists the contract change in its own section, and an upgrade that touches the
skills says so - after `npm install lexforge@<version>` comes
`lexforge init --tools <list>`, which rewrites them in place.

## 2.2.0 — 2026-10-03

Task plans can distinguish repository files from routes and external paths without
rewriting descriptive text or breaking existing plans.

### Contract

- Tasks accept an optional `Files:` continuation line with comma-separated backtick
  paths, for example ``Files: `src/http/routes.ts`, `tests/http/routes.test.ts` ``.
  It defines exact writable scope instead of inferring it from task prose.
- `check plan` reports `task-file-declaration` for repeated, empty, malformed or unsafe
  declarations. Paths must be canonical and relative to the workspace root; an invalid
  explicit declaration never falls back to inferred scope.
- Without `Files:`, legacy inference remains available but ignores absolute paths, URLs,
  traversal, backslashes, colons and noncanonical segments. Relative route names can still
  be ambiguous: use `Files:` to separate them from repository files.

### Other

- Valid `Check:` file operands still participate in shared-file and long-file checks
  without enlarging explicit writable scope. Execution-cycle path validation stays strict.
- The planning skill documents `Files:`, root-relative paths and the prohibition on
  resolving abbreviated names through filesystem search. Both README tables are updated.
- Parser, plan diagnostics and execution-boundary regressions cover POSIX and Windows paths.

After installing this version, refresh the planning skill with `lexforge init --tools <list>`.
The GitHub release includes `lexforge-2.2.0.tgz`, installable with
`npm install -g ./lexforge-2.2.0.tgz`. The updater continues to follow npm's `latest` tag;
a GitHub release alone does not publish the version to npm.

## 2.1.0 — 2026-10-03

Interactive CLI runs check npm for a newer version before executing the requested command.
Users can update immediately or keep working with their installed version.

### Contract

- No command, flag, JSON field or exit-code changes. Update checks are skipped for
  `--json`, redirected output and runs without an interactive terminal.

### Other

- When an update is available, enter `u` or `update` to run
  `npm install -g lexforge@latest`. An empty, negative or unrecognized answer keeps the
  installed version and executes the original command with its original arguments.
- A successful installation ends the old process and asks the user to repeat the command.
  Registry and installation failures allow the original command to continue.
- Registry checks have a three-second timeout and a 64 KiB response limit. Version
  comparison handles prereleases; Windows invokes `npm.cmd` through its command shell.
- English and Russian README version tables describe the update choice.

The updater follows npm's `latest` tag, not GitHub Releases. A GitHub release alone does
not make a version available to the updater. The attached `lexforge-2.1.0.tgz` archive
can be installed with `npm install -g ./lexforge-2.1.0.tgz`.

## 2.0.0 — 2026-10-03

Existing workflow 1 changes can migrate without losing trustworthy completed work.
Historical completion and current verification are tracked separately.

### Contract

- Breaking: `workflow migrate --change --to 2` returns a compact migration envelope
  instead of the workflow pin object. It includes `outputVersion`, `version`, `change`,
  `mode`, `applied`, `sourceWorkflow`, `targetWorkflow`, `inputDigest`, `summary`,
  `completedWrites`, `ledger` and `nextStep`; the old top-level `schema` and
  `schemaVersion` fields are no longer returned. Read the pin through `status.workflow`.
- Apply refuses conflicting or damaged evidence and invalid mappings. Checked boxes and
  a global check stamp alone do not confirm tasks. Existing callers must inspect the
  read-only `--dry-run` report before applying; `--task` and `--class` filter details.
  Filtered and unfiltered previews return exit 1 for reported blockers.
- New commands: `workflow reconcile --change --cycle --executor` and
  `workflow reconcile-review --change --cycle --file`. They record current checks and
  independent acceptance review with origin `reconciled`, without fabricated RED.
- Migrated pins include a ledger integrity reference. `migration.json` preserves source
  hashes, original evidence, decisions and provenance. Missing or modified referenced
  evidence blocks continuation and final gates.
- Status adds migration completion details. Context and resume expose completed/open task
  IDs, origins and ledger links. Fully confirmed predecessors satisfy dependencies;
  mixed cycles execute only their open tasks while retaining all acceptance context.
- Verify reports migration gaps and stale current coverage separately from historical
  completion, with migration counters in its summary. Archive requires the same gates
  and preserves the migration ledger.

### Other

- Apply reanalyzes under the execution lock, guards revision, worktree, configuration,
  task sources and targets, installs the durable ledger, and commits the workflow pin last.
  Matching prepared state recovers on rerun; identical applied state is a no-op.
- Reconciliation reviews append immutable records, including when the check preceded
  migration. Resolved legacy conflicts remain in the audit history.
- The first native cycle uses the migrated baseline and accepted later snapshots, so
  unreviewed edits cannot be absorbed as pre-existing work.
- English and Russian guides cover preview, trust policy, reconciliation, recovery,
  mixed cycles and installation boundaries. Updating the package does not authorize
  migration of existing changes.

Upgrade the CLI with `npm install -g lexforge@2.0.0`, then refresh installed skills with
`lexforge init --tools <list>`. Preview each explicitly authorized migration separately.

## 1.7.0 — 2026-10-02

Task context is scoped to one behavioural cycle. Full logs and execution history stay in
files, while the CLI tracks evidence, review and continuation across agent handoffs.

### Contract

- New commands: `context --change --task [--max-bytes]`, `workflow migrate --change --to 2`,
  `cycle start/run/review/close/restart`, and `resume --change`. Their JSON output uses
  `outputVersion: 1`. A size limit rejects oversized context; it never drops requirements.
- New changes include `workflow.json`, pinning workflow 2 and schema version 1. `new change`
  lists it in `created`, and change `status` includes `workflow`. A change without the pin
  stays on workflow 1; migration validates `execution-plan.json` and preserves task IDs,
  task files and existing evidence.
- `execution-plan.json` maps task IDs to cycles, file/symbol scope, requirements through
  task links, design headings, acceptance criteria, dependencies, commands, test files,
  material input files, environment names and specialist controls. Existing section
  dependencies and task file scope must be preserved.
- Workflow 2 records RED/GREEN against code state, tests, material inputs, runtime and
  declared environment, with full logs and hashes. RED requires exit 1 and the complete
  expected assertion line; known launch/compilation errors are refused. The reviewer must
  still verify the cause. A pure `mode: "move"` cycle is allowed only when every task
  explicitly declares `(move)`; regression GREEN and independent review remain mandatory.
- `cycle review` binds an independent report to current GREEN. `cycle close` requires all
  acceptance criteria and controls, no unresolved critical/important findings, valid
  snapshots and a current verdict. `verify` adds `summary.unclosedCycles` for workflow 2
  and reports `cycle-not-closed`; it checks current files against the latest reviewed
  snapshots and detects changes outside the execution plan.
- `cycle restart` retains previous attempts and the original review baseline. Added scope
  needs a proven baseline. Closure saves `continuation.json`; `resume` recomputes state
  from primary records, including unfinished cycles and open findings.
- `evidence record` and `evidence red` now save full output under the change's `execution/`
  directory. New records add `log` and `logHash`; old records remain readable. Output is
  compact by default and `--stream` restores live output. Evidence checks additionally
  report `stale-command` and `stale-log` for changed commands and damaged stored logs.

### Other

- Tasks retain their contract and links; journals hold execution history. Executor reports
  contain the result, changed files, test commands/results, open problems and evidence links.
- Review receives the cycle's before/after patch, including earlier uncommitted work only
  as baseline. Snapshot helpers remain available for workflow 1.
- The nine main `SKILL.md` files are 26% smaller. This measures instruction text, not
  end-to-end token savings. Workflow-specific guides are read when applicable.
- Markdown task and requirement readers ignore fenced examples without cutting required
  content. README files document the new workflow, migration and commands in both languages.

## 1.6.0 — 2026-09-20

A code file has a length a change may not take it past. Which way a file already over it
goes is the owner's answer, given before the plan is written and recorded in the change.

### Contract

- `lexforge/config.yaml` gains a `file_limit` section with two keys. `lines` is the line
  count a covered file may reach, 400 when the section or the key is absent. `include` is the
  list of patterns the limit covers, 24 source and test extensions by default; a project's own
  list replaces the default rather than adding to it. Patterns are globs matched with
  `picomatch`, and one starting with `!` excludes, so `!src/generated/**` leaves generated code
  out of the count. Markdown, JSON, YAML and lock files are outside the default list.
- A change's `.lexforge.yaml` gains `long_files`, taking `refactor` or `keep`. Every command
  that reads it refuses any other value with exit `2` and an error naming the field and the two
  values it accepts.
- `verify` checks a sixth dimension and answers with a sixth field on `summary`,
  `filesOverLimit`. The rule is `file-over-line-limit`, and the finding names the file, its
  line count at the start of the change, its count now and the limit. The start count is read
  from the commit that brought the change directory in, so growth during the change is what is
  judged. A file the change deleted is not reported. With no `long_files` recorded, the file is
  judged by the `refactor` rule and the finding names both ways out.
- `check plan` gains two finding rules. `long-file-without-path` names an existing covered file
  a task names that is over the limit while the change records no `long_files`, with the count,
  the limit and both values. `long-file-not-split-first` names, on the `refactor` path, a long
  file whose first naming task is not declared `(move)`.
- `lexforge init` writes the `file_limit` section into a new `config.yaml` commented out, with
  the default list and the `!src/generated/**` example. An existing config is not rewritten and
  runs on the defaults.
- `picomatch` 4 is a runtime dependency of the package.

### Other

- `lexforge-plan` counts the lines of every existing covered file its tasks will name before it
  writes `tasks.md`. When any is over the limit, it shows each one with its count, asks whether
  the change takes `refactor` or `keep`, and writes the answer to `.lexforge.yaml` first. It
  never chooses the path itself, and a user who hands the choice back is asked again. With no
  long file it asks nothing.
- On the `refactor` path the plan splits each long file in a task declared `(move)`, placed
  before every other task naming that file.
- An executor makes no edit that takes a covered file from within the limit to over it: the
  code that would goes into a new file, written there from the start. On `keep`, a file already
  over the limit gains no line, and wiring a new file into it is paid for by moving a block of
  at least as many lines out. Where no such block exists, the work stops for re-planning on
  `refactor` rather than adding the line.
- The repository holds its own `.ts` files under `src/` and `tests/` to 400 lines now, the same
  number the product ships as its default. It was 330 in 1.5.0.

## 1.5.0 — 2026-09-13

An executor dispatched for a section starts no agent of any kind, and a ticked task rests on a
failing run the machine performed and recorded rather than on a line quoted in an answer.

### Contract

- `lexforge evidence red --change <name> --task <id> --command <cmd>` is new. It runs the
  command itself and writes one record per task id into `red-runs.json` in the change
  directory. No flag accepts a failing line, an exit code or an output tail: the command that
  writes the record is the command that made the run. A run that comes back green exits `1` and
  writes nothing; a command the shell could not start exits `2` with `red-run-command-failed`.
  Its `--json` answer carries `record` alongside `change`, `task` and `nextStep`.
- `verify` checks a fifth dimension and answers with a fifth field on `summary`,
  `unrecordedTasks`: ticked tasks whose first named file lies outside `tests/` and outside the
  change directory and that carry no red record. The finding rule is `task-no-red-record`, and
  it is not waived for a change started before the records existed.
- `check plan` gains four finding rules: `task-missing-group-label`,
  `section-group-coverage-mismatch`, `section-group-shared-file` and `section-tasks-inline`.
- `tasks.md` is an index. It carries the title, the goal, the spec and one link per section, and
  each section's `Depends on:` line and tasks live in a file one path segment below it.
  `section-tasks-inline` refuses a plan that keeps tasks inside `tasks.md`, and refuses the
  hybrid that links a file and leaves tasks behind the link as well.
- Every task line carries a group label in square brackets after its number, such as
  `- [ ] 1.1 [A]`: letters, digits and hyphens, eight characters at most. A task whose whole
  work is carrying existing code between files carries `(move)` after that label and owes no
  red record.

### Other

- `lexforge-apply` bans the dispatch by effect, not by role. An executor starts no agent of any
  kind, the session holding the plan starts every agent of the implementation stage, and an
  agent that continues the executor's own work instead of looking at it is forbidden whatever
  the runtime calls its type. The rule was written against a `fork` that inherited a session's
  context and wrote eleven tasks on its own, and against the report that called that work a
  parallel editor's.
- A commit, a branch or edits in the tree an executor did not make are named unaccounted, with
  their paths, the commit and the branch written out, and work stops on them. Attributing them
  to a foreign session, a parallel editor, another user or a background tool is refused: that is
  a claim about a person made with no evidence.
- An agent the implementation stage dispatches works inside a budget of 300,000 tokens and
  reads a large file by line ranges rather than whole. A section that does not fit is dispatched
  in parts, down to one agent per task.
- A group label lets the independent groups of one section go to different agents at once, and
  `check plan` refuses a section whose two groups name the same file.
- A `.ts` file under `src/` or `tests/` runs to 330 lines at most, held by
  `tests/e2e/line-limit.test.ts`. Eighteen files over that line were split by subject; the
  longest had been 1766 lines.
- **Upgrade note**: a plan written before this release keeps its sections inside `tasks.md` and
  carries no group labels, so `check plan` reports one finding per section and one per task
  until the plan is converted. `npm install lexforge@1.5.0` followed by
  `lexforge init --tools <list>` brings the skills current; the index, the section files and the
  labels are added to the plan by hand. Tasks ticked before this release carry no red record,
  and `verify` names every one of them: record the run for each, declare the task a `(move)`
  where that is what it was, or clear the checkbox.

## 1.4.0 — 2026-09-11

`lexforge-apply` dispatches independent sections of a plan at once, and a defect ledger tracks
findings a review turns up without blocking on every one of them.

### Contract

- `lexforge defect record --change <name>`, `lexforge defect close <id>` and `lexforge defect
  list` are new. Their `--json` answers carry `defect` (or `defects`) and `nextStep`, the shape
  the other gates already use.
- `verify` and `archive` answer with a fourth field on `summary`, `openDefects`: the count of
  open `critical` or `important` entries the ledger holds against the change. An open entry at
  either level blocks both commands the way a stale stamp already does; an open `minor` entry
  never blocks.
- `check plan` gains seven finding rules about a plan's sections:
  `section-missing-depends-on`, `section-depends-on-unreadable`,
  `section-depends-on-repeated`, `section-number-repeated`, `section-unknown-dependency`,
  `section-dependency-cycle` and `section-concurrent-file`.

### Other

- Each section heading of `tasks.md` carries a `Depends on:` line: `none`, or the numbers of
  the sections it needs closed first. `lexforge-apply` dispatches every section of a wave — the
  sections whose dependencies are already closed — to its own executor and runs them at the
  same time; a section with no concurrent neighbour still runs task by task in the same session.
- Two pauses are gone. A skill that meets `workspace-not-found` runs
  `lexforge init --tools <list>` at the project root itself instead of asking first, and a
  planning skill that finishes an artifact runs the next step the command named instead of
  naming it and stopping. The stop at the boundary of planning stays, and so does every stop
  an artifact's own rule owns.
- **Upgrade note**: a `tasks.md` written before this release carries no `Depends on:` line.
  `check plan` reports one new finding per section until it is added; `npm install
  lexforge@1.4.0` followed by `lexforge init --tools <list>` brings the skills current, but the
  `Depends on:` lines themselves have to be added to the plan by hand.

## 1.3.0 — 2026-09-05

Model sets per runtime, and the roles removed. Agents of different vendors work in one
repository, each resolving its own model out of one `lexforge/config.yaml`, and every skill
carries the model it wants when the project names none. The three roles are gone: the choice
they held moved into the skills, where it needs no setting up per project.

### Contract

- `instructions` and `status --change` take `--tool <name>`, the runtime the call comes from.
  A call that names none resolves against the top level of the `models` section, as before.
- The `role` field is removed from the `instructions` answer, from every entry of `stages`
  and from every artifact of `status --change`. `provider` and `model` stay where they were.
- The `models` section takes `tools`, one entry per runtime, each naming a provider and a
  model. An entry decides alone: the top-level `default` is not read for a runtime that has
  one. The section no longer takes `analysis`, `development` or `review`; a key left over
  from them is ignored, and no command refuses because of it.

### Other

- `lexforge init --tools claude,codex` writes a `tools` entry for each named runtime that has
  a vendor of its own and no top-level `default`. `cursor`, `opencode` and `agents` front
  several vendors and get no entry.
- Every skill opens with a model block: the model it runs on, one line per provider of the
  shipped catalogue. The planning skills and the completion check name the strong model of a
  provider, the implementation and debugging skills the middle one, and archival names none.
  A model named by the project replaces what the block names.
- Upgrading means upgrading the package and reinstalling the skills together, with one
  `lexforge init --tools <list>`: a skill of this version calls an option the previous CLI
  does not know.

## 1.2.0 — 2026-08-31

Model assignment. A project names which model each stage of a change runs on, and the
skills hand the work to that model instead of writing it themselves. Nothing is renamed
and nothing is removed: `outputVersion` stays `1`, the exit codes are the ones 1.1.0
gave, and a project without the new section behaves exactly as before.

### Contract

- `instructions` answers with three more fields: `role`, `provider` and `model` of the
  requested artifact. A project with no assignment gets the role filled and the other two
  empty.
- `status --change` answers with `stages`: one entry per stage of the pipeline, including
  the four that write no artifact, each with `stage`, `role`, `provider` and `model`.
  Archival comes back with all three empty, because it carries no role.
- Every artifact of `status --change` carries `role` and `model` beside its status.

### Other

- `lexforge/config.yaml` reads a `models` section: a `default` naming a provider and a
  model, optional overrides for the roles `analysis`, `development` and `review`, and a
  `providers` catalogue. A role left out falls back to the `default`; an incomplete
  section is not refused, and a role that is not a mapping of a provider and a model is,
  with exit code `2` naming the role.
- `lexforge init` writes that section into a new project and seeds the catalogue from the
  list shipped with the installed version. An existing `config.yaml` is left byte for
  byte as it was, the missing section included.
- Names are never checked against the catalogue: a model released after the installation
  is passed through exactly as the config wrote it.
- The nine skills carry one model gate, word for word the same in all of them: work in
  silence when the model matches, hand the work to a subagent on the assigned model when
  it does not, and stop without writing when that model cannot be reached.
- `README.md` and `README.ru.md` carry the section on the assignment: the three roles,
  the block to paste, what a project installed earlier does, and which runtime the
  handover is confirmed in.

## 1.1.0 — 2026-08-30

Windows. Three defects the run on three systems brought out, and none of them touches
the shape of an answer: no field is renamed, `outputVersion` stays `1`, and the exit
codes are the ones 1.0.0 gave.

### Contract

- A path in an answer is written with `/` on every system. Only the form of the value
  changes, and only on Windows, where a path used to carry the separator of the system.
  A path handed to a command in an argument comes back as it was passed.

### Other

- Reading an artifact no longer depends on the line endings of the file. A delta spec,
  a plan, a main spec or a configuration written with `\r\n` gives the same findings,
  the same line numbers and the same exit code as one written with `\n`. On Windows
  `validate --strict` used to answer `0` on a spec it had to reject, and say nothing.
- `doctor` finds the command on PATH on Windows: the search goes through the extensions
  of `PATHEXT`, where that system keeps what may be run. The execute bit is still
  required on Linux and macOS, and a directory of that name is still not a command.
- `doctor` no longer reports a healthy Windows installation as two. The name on PATH there
  resolves to a wrapper, `lexforge.cmd`, and the wrapper starts the JavaScript beside it:
  what is compared is the tree they live in, not the two paths.
- `evidence record` refuses to stamp a command Windows could not start. Its shell answers
  the same number for a name it cannot find and for a check that failed, so the question
  asked there is whether the first word of the command lies on PATH.
- The suite runs on Linux, macOS and Windows, on Node 20.19 and 22, on every push and
  every pull request.

## 1.0.0 — 2026-08-30

First published release.

### Contract

- Commands `init`, `new change`, `status`, `instructions`, `validate`, `check plan`,
  `evidence record`, `check evidence`, `verify`, `archive` and `doctor`, each answering
  `--json` with `outputVersion: 1` and a `nextStep`.
- Three exit codes and no others: `0` no findings, `1` a finding, `2` a call not carried out.
- `lexforge --version` prints the version of the installed package and exits `0`.
- The install manifest carries the package version that wrote it: a package updated without
  a matching `init --tools` is a finding `doctor` reports, naming both versions.

### Other

- Nine skills installed into the directory of a named agent, with an install manifest
  written next to it.
- Two built-in schemas, `spec-driven` and `bounded`, with seven artifact templates.
- `doctor` assembles six installation health checks into one answer: workspace and
  configuration, verification labels, installed skills, command name on PATH, git
  repository, and the Node version required by the package.
- A freshly installed package walks through `init` and `doctor` without a build step or a
  development checkout.
