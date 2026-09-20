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

### Requirement: A section records what it depends on

Every numbered section of `tasks.md` SHALL carry a `Depends on:` line naming the sections that
have to be closed before it starts, or the word `none`.

`lexforge check plan --change <name>` SHALL report a finding on a section carrying no such line,
and the finding SHALL name the section's number. A plan with such a finding SHALL end the
command with exit code `1`.

Two sections SHALL count as concurrent when neither names the other in its `Depends on:` line,
directly or through the sections that line leads to. Two concurrent sections whose tasks name
the same file SHALL be a finding: both become ready at the same moment, both are dispatched, and
each agent loses the other's work. Naming one and the same dependency is no protection - two
sections that both wait for section 2 are released together the instant it closes.

A `Depends on:` line naming a section that is not in the plan SHALL be a finding, and so SHALL a
cycle: two sections that wait for each other are never ready.

#### Scenario: A section says nothing

- **WHEN** section 3 carries no `Depends on:` line
- **THEN** the command ends with exit code `1` and names section 3

#### Scenario: Two independent sections on one file

- **WHEN** sections 5 and 6 both say `Depends on: none` and tasks in both name
  `src/core/run.ts`
- **THEN** the command ends with exit code `1` and names both sections and the file

#### Scenario: One dependency shared by two sections

- **WHEN** sections 3 and 4 both say `Depends on: section 2` and tasks in both name
  `src/cli/commands/defect.ts`
- **THEN** the command ends with exit code `1` and names both sections and the file, because
  closing section 2 releases them together

#### Scenario: A shared file on a chain

- **WHEN** section 4 says `Depends on: section 3`, section 3 says `Depends on: section 2`, and
  tasks in sections 2 and 4 name one file
- **THEN** the dimension adds no finding: section 4 cannot start until section 2 is closed

#### Scenario: A dependency that does not exist

- **WHEN** section 4 says `Depends on: section 9` and the plan has six sections
- **THEN** the command ends with exit code `1` and names section 4 and the missing section

#### Scenario: A cycle

- **WHEN** section 3 says `Depends on: section 5` and section 5 says `Depends on: section 3`
- **THEN** the command ends with exit code `1` and names both sections

#### Scenario: A plan that answers

- **WHEN** every section carries the line, no cycle exists, and no two concurrent sections share
  a file
- **THEN** the dimension adds no finding

### Requirement: A section's group labels are checked for presence, exact coverage, and shared files

`lexforge check plan --change <name>` SHALL raise a finding, and SHALL NOT merely warn, on
each of three counts:

- a task carrying no group label;
- a section whose group labels do not cover its own tasks exactly once - the count reads
  against the labels each task carries, so a task whose labels cover it twice fails this
  count the same way a task whose labels cover it zero times does;
- two groups of one section naming the same file in backticks.

The third count is what keeps a TDD triple from being split across two agents without a
rule of its own: the task that writes the test, the task that runs it and watches it fail,
and the task that writes the implementation all name the same file somewhere in their own
line or their `Check:` command, so the shared-file count already refuses landing them in
different groups. No separate rule about triples exists, and none is needed.

Every finding of these three counts SHALL carry a rule id and a line number, in the shape
every other finding of this capability carries.

#### Scenario: A task with no label

- **WHEN** section 4 carries a task written as `- [ ] 4.2 Run the test and watch it fail`,
  with no bracket after the id
- **THEN** the command reports a finding naming task 4.2 and its line, and exits `1`

#### Scenario: A bracketed word in a task's own text

- **WHEN** section 4 carries a task written as `- [ ] 4.5 [reference] task text...`, whose
  bracketed word is nine letters long and therefore not a label
- **THEN** `[reference]` stays part of task 4.5's text and the command reports a finding
  naming task 4.5 for carrying no group label at all, the same finding a task with no bracket
  at all would get

#### Scenario: A task double-covered

- **WHEN** section 4 holds tasks 4.1 through 4.4 and task 4.3 is written
  `- [ ] 4.3 [A] [B] Write the implementation`, carrying two labels
- **THEN** the command reports a finding naming section 4 and task 4.3, because task 4.3's
  labels cover it twice, not once

#### Scenario: A TDD triple split across groups

- **WHEN** task 5.1, labelled `[A]`, writes the failing test in
  `tests/core/gates/plan-check.test.ts`; task 5.2, labelled `[A]`, runs it with
  `Check: npx vitest run tests/core/gates/plan-check.test.ts`; and task 5.3, labelled `[B]`,
  writes the implementation with the same `Check:` command naming
  `tests/core/gates/plan-check.test.ts`
- **THEN** the command reports a finding naming section 5, groups `A` and `B`, and the file
  `tests/core/gates/plan-check.test.ts`, and exits `1`

#### Scenario: A plan whose labels answer all three counts

- **WHEN** every task of every section carries exactly one label, every section's labels
  cover its own tasks exactly once, and no two groups of one section name the same file
- **THEN** the command adds no finding for any of the three counts

### Requirement: A command's own program is not a file the task names

`namedFiles` SHALL read the paths a `Check:` command operates on, and SHALL NOT read the
program that runs it. A command is a backtick span that splits into more than one token; a
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

- **WHEN** a task's own line names `tests/core/gates/x.test.ts` in a backtick span outside
  any `Check:` command, the span holding no whitespace at all
- **THEN** the task's `namedFiles` still holds `tests/core/gates/x.test.ts` - a single-token
  span carries no program to drop

#### Scenario: The program of a red-run command is not a named file

- **WHEN** a task's `Check:` command is `node bin/lexforge.js evidence red --change c --task
  1.2 --command "npx vitest run tests/core/gates/x.test.ts"`
- **THEN** the task's `namedFiles` holds `tests/core/gates/x.test.ts` and does not hold
  `bin/lexforge.js`

#### Scenario: A command whose first argument is the target file

- **WHEN** a task's `Check:` command is `pytest tests/test_login.py`
- **THEN** the task's `namedFiles` holds `tests/test_login.py` - `pytest` is not one of the
  interpreters this requirement drops a second token for, so only `pytest` itself is dropped

#### Scenario: A flag right after a recognised interpreter does not hide the file that follows it

- **WHEN** a task's `Check:` command is `python3 -m pytest tests/test_login.py`
- **THEN** the task's `namedFiles` holds `tests/test_login.py` and does not hold `-m` -
  `python3` is a recognised interpreter, but `-m` is not path-shaped, so nothing past
  `python3` is dropped on the interpreter's account and `tests/test_login.py` is still
  checked and named like any other token

#### Scenario: An interpreter outside the recognised list still has its script named

- **WHEN** a task's `Check:` command is `perl script.pl`
- **THEN** the task's `namedFiles` holds `script.pl` - `perl` is outside the short list of
  interpreters this requirement recognises, so the token after it is named like any other
  operand, carrying the cost this requirement writes down rather than resolves

#### Scenario: Every path a command operates on is still named

- **WHEN** a task's `Check:` command is `npx vitest run tests/core/gates/a.test.ts
  tests/core/gates/b.test.ts`
- **THEN** the task's `namedFiles` holds both `tests/core/gates/a.test.ts` and
  `tests/core/gates/b.test.ts`

#### Scenario: A command naming only its program names nothing

- **WHEN** a task's only `Check:` command is `node scripts/build.js`, with no argument past
  the program that names a path
- **THEN** that command contributes nothing to the task's `namedFiles`

#### Scenario: A TDD triple sharing a test file still shares it under evidence red

- **WHEN** task 6.1, labelled `[A]`, writes the failing test in `tests/core/gates/x.test.ts`;
  task 6.2, labelled `[A]`, records the red run with `Check: node bin/lexforge.js evidence
  red --change c --task 6.3 --command "npx vitest run tests/core/gates/x.test.ts"`; and task
  6.3, labelled `[B]`, writes the implementation with `Check: npx vitest run
  tests/core/gates/x.test.ts`
- **THEN** the command reports a finding naming section 6, groups `A` and `B`, and the file
  `tests/core/gates/x.test.ts`, exactly as the plain `Check:` command already would

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

### Requirement: A long file named without a recorded path is a finding

`check plan` SHALL report a finding for each existing covered file named by a task that is
over the line limit when the change's `.lexforge.yaml` holds no `long_files`.

The finding SHALL name the file, its line count, the limit, and the two values `long_files`
accepts.

#### Scenario: A long file with no path fails the plan

- **WHEN** a task of `add-refunds` names `src/billing.ts`, 612 lines, the limit is 400, and
  `.lexforge.yaml` holds no `long_files`
- **THEN** `check plan --change add-refunds` reports a finding naming `src/billing.ts`, 612
  lines, the limit 400, and `refactor` and `keep`, and exits `1`

#### Scenario: A recorded path clears the finding

- **WHEN** the same plan runs with `long_files: keep` in `.lexforge.yaml`
- **THEN** `check plan` reports no finding about `src/billing.ts`

### Requirement: On the refactor path a long file is split before other work on it

On the `refactor` path, `check plan` SHALL report a finding for each long file whose first
naming task is not declared `(move)`.

#### Scenario: Feature work before the split fails the plan

- **WHEN** `long_files: refactor` is recorded and the first task naming `src/billing.ts`, 612
  lines, adds a refund method to it without `(move)`
- **THEN** `check plan` reports a finding naming `src/billing.ts` and that task, and exits
  `1`

#### Scenario: A split placed first passes

- **WHEN** `long_files: refactor` is recorded and the first task naming `src/billing.ts` is
  declared `(move)`
- **THEN** `check plan` reports no finding about the order of work on `src/billing.ts`
