# plan-selfcheck

## Purpose

Checking a plan before anyone starts writing code from it. A plan with a task that says "same
pattern from here on" looks finished and falls apart halfway through: the person doing the work
ends up inventing what the plan's author never worked out. This spec records what counts as an
unrecorded task, how a delta requirement links to a task, and why a machine catches the same
name spelled two different ways.

## Requirements

### Requirement: Placeholders are found from a marker list

The self-check SHALL scan the text of every task for markers of unrecorded work and report a
finding on each match.

The list SHALL carry markers in two languages, because artifacts are written in the project's
language: `TBD`, `TODO`, `FIXME`, `XXX`, `add error handling`, `similar to task`, `same as
above`, `and so on`, `as needed`, «уточнить», «дописать», «доделать», «по аналогии», «аналогично
задаче», «как в задаче», «остальное так же», «и так далее», «и т. д.», «и прочее»,
«при необходимости», «если понадобится», «добавить обработку ошибок», «разобраться».

The comparison SHALL be case-insensitive and treat «е» and «ё» as the same letter, with word
boundaries that understand Cyrillic: a marker inside a longer word does not count as a match.

#### Scenario: Russian phrasing

- **WHEN** a task contains the text «дальше по аналогии с задачей 3»
- **THEN** the check reports a finding with the line number and quotes the matched marker

#### Scenario: Marker in uppercase

- **WHEN** a task contains the word «УТОЧНИТЬ»
- **THEN** the match counts

#### Scenario: Marker inside another word

- **WHEN** a task contains the word «доделать» as part of the word «переделать»
- **THEN** there is no finding

### Requirement: A project extends the marker list but does not shrink it

The file `lexforge/config.yaml` SHALL accept a list of additional markers. Its values are added
to the built-in markers.

There SHALL be no way to remove a built-in marker or turn off the rule: the marker list grows
from findings on real plans, and reversing that opens the gate.

#### Scenario: Project added its own marker

- **WHEN** the project config records the marker «на усмотрение исполнителя», and a task
  contains that phrase
- **THEN** the check reports a finding

#### Scenario: Built-in markers still work

- **WHEN** a project has added its own marker list
- **THEN** the built-in markers keep working

### Requirement: Signs of an unrecorded task beyond the word list

The marker list does not cover a rephrased version of the same idea, so the self-check SHALL
also report a finding when:

- the task text points to another task by number (`задача 7`, `шаг 3`, `п. 4`, `Task 7`): the
  work is named by a pointer, not described;
- the task text is shorter than thirty characters: a task that short does not describe the work;
- the task text still carries template traces — a markup comment or an angle-bracket
  placeholder.

The rule about template traces SHALL apply the same check as strict-mode artifact validation: a
command inside backticks does not count as a placeholder.

#### Scenario: Task points to another task

- **WHEN** a task's text contains «повторить для остальных случаев, как в задаче 5»
- **THEN** the check reports a finding and names the task-reference rule

#### Scenario: Task too short

- **WHEN** a task's text is just the word «Тесты»
- **THEN** the check reports a finding and states the required length

#### Scenario: Command inside backticks

- **WHEN** a task contains `lexforge new change <name>` inside backticks
- **THEN** there is no placeholder finding

### Requirement: Every delta requirement is named by a task

A task MAY carry one or more references to a requirement in the form
`-> <capability-path>#<requirement name>`.

The self-check SHALL report a finding for every requirement in the change's delta specs that no
task references. The finding text names the capability and the requirement name.

A reference naming a requirement that does not exist in the delta SHALL become its own finding:
otherwise a typo in the name leaves the requirement uncovered while looking covered.

#### Scenario: Requirement with no tasks

- **WHEN** a delta carries three requirements, and the references in the tasks name only two
  of them
- **THEN** the check reports one finding naming the uncovered requirement

#### Scenario: Reference to a nonexistent requirement

- **WHEN** a task references a requirement that is not in any delta spec of the change
- **THEN** the check reports a finding with the task's line number and lists the requirement
  names of that capability

#### Scenario: Change with a skipped delta

- **WHEN** checking a change whose delta-spec artifact is declared skipped
- **THEN** the coverage rule gives no findings

### Requirement: One identifier is named one way

The self-check SHALL collect the names recorded in backticks across the tasks, reduce each to a
comparison key (lowercase, hyphens and underscores stripped), and report a finding when one key
matches two or more different spellings.

The finding text SHALL name both spellings and the line numbers where they appear.

Entries that contain a space SHALL NOT take part in the comparison: `lexforge check plan` is a
command call, and its key matching a function name is not a finding.

#### Scenario: Same name, different spelling

- **WHEN** task 3 names the field `resolvedOutputPath`, and task 7 names `resolved_output_path`
- **THEN** the check reports a finding with both spellings and both line numbers

#### Scenario: Different names with close spelling

- **WHEN** tasks name the files `run.ts` and `run.test.ts`
- **THEN** there is no finding

#### Scenario: Command and function

- **WHEN** tasks contain `lexforge check plan` and `checkPlan`
- **THEN** there is no finding

### Requirement: A self-check finding names the location

Every finding SHALL carry a relative path to the plan file, the task's line number, a rule id,
and text explaining what to rewrite.

Findings SHALL print grouped by file, in ascending line-number order.

#### Scenario: Several findings in one plan

- **WHEN** a plan has three violations across different tasks
- **THEN** the findings print in ascending line-number order, each with its own rule

#### Scenario: No plan

- **WHEN** the self-check is called on a change with no `tasks.md` written
- **THEN** the command exits with code `2` and names the command for getting plan instructions

### Requirement: The plan parses whether it is written as one file or as an index of files

`lexforge check plan --change <name>`, and every other gate that reads the plan, SHALL
parse `tasks.md` in either of two forms:

- the whole plan in that one file, every section's `Depends on:` line and tasks written
  directly under its heading, the way every plan wrote it before this requirement existed;
- an index, where `tasks.md` carries each section's heading and a link to the file that
  holds that section's `Depends on:` line and its tasks, one path segment below
  `tasks.md`.

A change archived before the index form existed has its plan on disk in the first form
only, and reading it SHALL give the same tasks, the same sections, and the same line
numbers it gave before the second form existed.

#### Scenario: An archived plan, written before the split

- **WHEN** checking the plan of a change archived before the index form existed, its
  sections and tasks written directly inside `tasks.md`
- **THEN** the sections and tasks parse the same way they parsed before the index form
  existed

#### Scenario: An index that links to a section's own file

- **WHEN** `tasks.md` carries the heading of section 4 and a link to the file that holds
  section 4's `Depends on:` line and its tasks, one path segment below `tasks.md`
- **THEN** section 4's heading, `Depends on:` line, and tasks all resolve to the one
  section, read from the two files together, exactly as `check plan` would read them from
  one file

### Requirement: A plan with tasks left inside `tasks.md` is a finding

`lexforge check plan --change <name>` SHALL raise a finding when a section's tasks are
written directly under its heading inside `tasks.md`, instead of in a file of their own
linked from the index. The finding SHALL name the file `tasks.md` and SHALL say to move
the section's tasks into a file of their own and link it from the index.

There SHALL be no exemption from this finding: not for a plan of one section, not for a
plan still being written, and not for a plan short enough to read in one sitting. Size is
not a defense the gate accepts.

A section whose heading is followed by a lone link to a file of its own, but which also
carries a `Depends on:` line or tasks of its own directly under that link inside
`tasks.md`, raises the same finding: the link already resolves the section's `Depends on:`
line and tasks from the linked file, so the lines left behind the link are read from
neither file and are silently dropped. The finding SHALL name the section carrying the
extra lines and SHALL say to remove the `Depends on:` line and tasks left behind the link,
keeping the link as the section's only content under its heading.

#### Scenario: A section still holding its tasks inside `tasks.md`

- **WHEN** section 3 of `tasks.md` carries its tasks directly under its heading instead of
  a link to a file of its own
- **THEN** the command reports a finding naming `tasks.md` and instructing the author to
  move section 3's tasks into a file of their own, and exits `1`

#### Scenario: A plan of one section claims an exemption

- **WHEN** a plan has one section only, and that section's tasks are written directly
  inside `tasks.md`
- **THEN** the command reports the same finding a nine-section plan would get: one section
  is not a reason to skip the file of its own

#### Scenario: A section links to its own file and also keeps tasks behind the link

- **WHEN** section 5 of `tasks.md` carries a lone link to a file of its own, and also
  carries a `Depends on:` line or tasks directly beneath that link
- **THEN** the command reports a finding naming section 5 and instructing the author to
  remove the `Depends on:` line and tasks left behind the link, and exits `1`

### Requirement: A task traced to a diagram or a mockup names it

A task that names a requirement carrying an `Interaction:` or a `Mockup:` line SHALL name,
in its text, the diagram anchor or the mockup path of that requirement, in the form
`specs/<capability>/spec.md#<anchor>` or `specs/<capability>/mockups/<file>`.

A task without that reference SHALL be a finding of `lexforge check plan` naming the task
and the requirement.

The brief that `lexforge task start` writes SHALL include the referenced diagram, contract
table or mockup.

#### Scenario: A UI task without its mockup

- **WHEN** task 2.1 names the requirement "Login screen", which holds
  `Mockup: mockups/login.html`, and the task text does not name that path
- **THEN** `lexforge check plan` reports task 2.1 and "Login screen"

#### Scenario: The executor receives the mockup

- **WHEN** task 2.1 names `specs/web/mockups/login.html`
- **THEN** the brief of `lexforge task start --change <name> --task 2.1 --executor <id>`
  includes that mockup and its CSS file

### Requirement: A task records what it depends on

A task MAY carry one `Depends on:` continuation line naming task ids. A task SHALL be ready when
the sections named in its section's `Depends on:` line and the tasks named in its own line are
closed; a task without the line depends on its section's dependencies only.
`lexforge check plan --change <name>` SHALL report `task-depends-on-unknown` for an id the plan
lacks and `task-depends-on-forward` for an id that comes later in the plan.

#### Scenario: A dependency on a missing task

- **WHEN** task `1.1` says `Depends on: 9.9` and the plan has no task `9.9`
- **THEN** `check plan` reports `task-depends-on-unknown` on task `1.1` and exits `1`

#### Scenario: A dependency on a later task

- **WHEN** task `1.2` says `Depends on: 1.3`
- **THEN** `check plan` reports `task-depends-on-forward` on task `1.2` and exits `1`

### Requirement: Tasks that write one file are ordered by their dependencies

Two tasks whose `Files:` share a file SHALL be ordered: one of them depends on the other,
directly or through the tasks and sections its dependencies lead to. Otherwise
`lexforge check plan --change <name>` SHALL report `shared-file-without-order` and name both
tasks and the file.

#### Scenario: Two unordered tasks on one file

- **WHEN** tasks `1.1` and `1.2` both declare `src/a.ts` and neither depends on the other
- **THEN** `check plan` reports `shared-file-without-order` and exits `1`

#### Scenario: The same tasks ordered

- **WHEN** task `1.2` says `Depends on: 1.1`
- **THEN** the shared file adds no finding

#### Scenario: Two sections in order

- **WHEN** section 2 says `Depends on: 1` and a task in each section declares `src/a.ts`
- **THEN** the shared file adds no finding

### Requirement: A task names a test and a command

Every task SHALL carry one `Test:` line with backtick paths, except a task declared `(move)`,
and one `Command:` line with one backtick command. `lexforge check plan --change <name>` SHALL
report `task-missing-test` and `task-missing-command` for a missing line, `task-field-repeated`
for a second line of one field, `task-field-malformed` for text outside the backtick spans, and
`task-control-unknown` for a `Controls:` value outside `authorization`, `cryptography`,
`tenant-isolation` and `migrations`.

#### Scenario: A task with no fields

- **WHEN** task `1.1` carries no continuation lines
- **THEN** `check plan` reports `task-missing-files`, `task-missing-test` and
  `task-missing-command` on it

#### Scenario: A move task

- **WHEN** task `1.1` is declared `(move)` and carries `Files:` and `Command:`
- **THEN** no field finding is reported on it

#### Scenario: An unknown control

- **WHEN** task `2.1` says `Controls: payments`
- **THEN** `check plan` reports `task-control-unknown` naming `payments`

### Requirement: A task declares its writable files

Every task SHALL carry exactly one `Files:` continuation line, containing one or more comma-separated backtick spans, and the plan parser SHALL use those spans as the task's exact `files` value. Writable files SHALL NOT be inferred from the rest of the task's text. Every declared value SHALL be a canonical path relative to the workspace root: it is non-empty, uses forward slashes, is not absolute, has no URL scheme or colon, and has no empty, `.` or `..` segment. `lexforge check plan --change <name>` SHALL report `task-missing-files` on a task without the line, and a finding at the task when the field is repeated, empty, malformed, or contains an unsafe value; it SHALL NOT silently omit an invalid declaration.

#### Scenario: Explicit scope wins over path-shaped prose

- **WHEN** a task declares `Files: `src/http/routes.ts`` and its other prose mentions `/api/auth` and `/etc/nginx/conf.d` in backticks
- **THEN** the task's `files` contains only `src/http/routes.ts`, and the external route and server path do not enter writable file scope

#### Scenario: Several explicitly declared repository files

- **WHEN** a task carries `Files: `src/http/routes.ts`, `tests/http/routes.test.ts``
- **THEN** the task's `files` contains those two root-relative paths in declaration order

#### Scenario: An unsafe explicit path is not ignored

- **WHEN** a task declares `Files: `/etc/nginx/conf.d`` or `Files: `../outside.ts``
- **THEN** `lexforge check plan --change <name>` reports an unsafe explicit file finding on that task and exits with code `1`

#### Scenario: A malformed or repeated declaration is rejected

- **WHEN** a task has an empty `Files:` line, text outside the comma-separated backtick spans, or a second `Files:` line
- **THEN** `lexforge check plan --change <name>` reports a file declaration finding on that task and exits with code `1`

#### Scenario: A task without the line

- **WHEN** a task carries no `Files:` line
- **THEN** `lexforge check plan --change <name>` reports `task-missing-files` on that task and exits with code `1`

### Requirement: A section records the sections it waits for

Every numbered section of `tasks.md` SHALL carry a `Depends on:` line naming the sections that
have to be closed before its tasks start, or the word `none`.

`lexforge check plan --change <name>` SHALL report a finding on a section carrying no such line,
and the finding SHALL name the section's number. A plan with such a finding SHALL end the
command with exit code `1`.

A `Depends on:` line naming a section that is not in the plan SHALL be a finding, and so SHALL a
cycle: two sections that wait for each other are never ready.

Files shared between tasks are checked task by task, by "Tasks that write one file are ordered
by their dependencies", and not section by section.

#### Scenario: A section says nothing

- **WHEN** section 3 carries no `Depends on:` line
- **THEN** the command ends with exit code `1` and names section 3

#### Scenario: A dependency that does not exist

- **WHEN** section 4 says `Depends on: section 9` and the plan has six sections
- **THEN** the command ends with exit code `1` and names section 4 and the missing section

#### Scenario: A cycle

- **WHEN** section 3 says `Depends on: section 5` and section 5 says `Depends on: section 3`
- **THEN** the command ends with exit code `1` and names both sections

#### Scenario: A plan that answers

- **WHEN** every section carries the line and no cycle exists
- **THEN** the dimension adds no finding

### Requirement: The program of a task's command is not a file the task names

`namedFiles` SHALL read the paths a command of a task operates on - the command of its
`Command:` line and a command the task names on any other line of its own - and SHALL NOT read
the program that runs it. A command is a backtick span that splits into more than one token; a
span with no whitespace at all is a bare file reference, not a command, and this requirement
does not touch it - it is still checked and named exactly as it is today. Of a command's
tokens, the leading one is the program, dropped whether or not it is path-shaped.

The token right after the program is dropped too, as the script that program runs, only when
both hold: the leading token is one of a short, closed list of interpreters that run a script
handed to them - `node`, `python`, `python3`, `ruby`, `sh`, `bash` - and the token right after
it is itself path-shaped. A program outside that list - `pytest`, `jest`, `ruff`, `perl` - is
never assumed to run a script, so nothing past its own leading token is dropped on its
account, whether or not that program's name happens to be path-shaped itself. An interpreter
from the list followed by a flag rather than a script - the flag failing the path-shape test -
also drops nothing beyond the leading token: the flag is checked like any other token, fails
on its own account, and whatever path-shaped token follows it is still named.

Every remaining token past whatever the program drops is still checked and named exactly as
it is today. A command whose every token past the program fails the path-shape test names
nothing from that command: the program itself is never counted as a stand-in subject.

The paths of `Command:` enter `namedFiles` and SHALL NOT enter the task's `files`, which only
`Files:` writes.

This narrowing has a cost, written down rather than left for the next reader to rediscover:
an interpreter outside the recognised list, invoked with a script as its first argument -
`perl script.pl`, `tsx app.ts` - still has that script named as a target, the same way any
other program's first path-shaped argument is named. That ambiguity is not new and is not
made worse here - it is the same one every other command already carries, such as `cp
a.txt b.txt` naming both arguments without telling which is read and which is written. This
requirement only stops the short, closed list of common interpreters from swallowing the
file that follows them; it does not, and cannot, tell a script from an ordinary argument for
every program a task might invoke.

#### Scenario: A bare file reference is not a command and keeps naming itself

- **WHEN** a task carrying no `Files:` line names `tests/core/gates/x.test.ts` in a backtick
  span outside its `Command:`, the span holding no whitespace at all
- **THEN** the task's `namedFiles` still holds `tests/core/gates/x.test.ts` - a single-token
  span carries no program to drop, and a task that does carry a `Files:` line names the paths
  of its three fields and of the commands it writes, its prose giving no scope of its own

#### Scenario: The program of a node command is not a named file

- **WHEN** a task's `Command:` is `node scripts/run-tests.js tests/core/gates/x.test.ts`
- **THEN** the task's `namedFiles` holds `tests/core/gates/x.test.ts` and does not hold
  `scripts/run-tests.js`

#### Scenario: A command whose first argument is the target file

- **WHEN** a task's `Command:` is `pytest tests/test_login.py`
- **THEN** the task's `namedFiles` holds `tests/test_login.py` - `pytest` is not one of the
  interpreters this requirement drops a second token for, so only `pytest` itself is dropped

#### Scenario: A flag right after a recognised interpreter does not hide the file that follows it

- **WHEN** a task's `Command:` is `python3 -m pytest tests/test_login.py`
- **THEN** the task's `namedFiles` holds `tests/test_login.py` and does not hold `-m` -
  `python3` is a recognised interpreter, but `-m` is not path-shaped, so nothing past
  `python3` is dropped on the interpreter's account and `tests/test_login.py` is still
  checked and named like any other token

#### Scenario: An interpreter outside the recognised list still has its script named

- **WHEN** a task's `Command:` is `perl script.pl`
- **THEN** the task's `namedFiles` holds `script.pl` - `perl` is outside the short list of
  interpreters this requirement recognises, so the token after it is named like any other
  operand, carrying the cost this requirement writes down rather than resolves

#### Scenario: Every path a command operates on is still named

- **WHEN** a task's `Command:` is `npx vitest run tests/core/gates/a.test.ts
  tests/core/gates/b.test.ts`
- **THEN** the task's `namedFiles` holds both `tests/core/gates/a.test.ts` and
  `tests/core/gates/b.test.ts`

#### Scenario: A command naming only its program names nothing

- **WHEN** a task's only `Command:` is `node scripts/build.js`, with no argument past the
  program that names a path
- **THEN** that command contributes nothing to the task's `namedFiles`

#### Scenario: Command paths stay out of the writable files

- **WHEN** task 6.1 carries `Files: `src/a.ts`` and `Command: `npx vitest run tests/a.test.ts``
- **THEN** its `namedFiles` holds `tests/a.test.ts` and its `files` holds only `src/a.ts`

