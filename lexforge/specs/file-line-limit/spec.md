# file-line-limit

## Purpose

The line limit a project sets on its code files, and what counts as keeping to it. An agent
pays for every line of a file it reads, so a file that keeps growing bloats every later task
that touches it. The planning skill, `check plan`, the executor and `verify` all read their
answer from here: which files the limit covers, how their lines are counted, and what the
two paths for files already over the limit demand.

## Requirements

### Requirement: The limit and the files it covers come from project configuration

The limit SHALL be read from the `file_limit` section of `lexforge/config.yaml`: its `lines`
key SHALL give the number of lines, and its `include` key SHALL give the list of file
extensions or path patterns the limit covers.

With no `file_limit` section, the limit SHALL be 400 lines and SHALL cover the default list.
A project's `lines` SHALL replace 400, and a project's `include` SHALL replace the default
list rather than add to it.

#### Scenario: No section gives the defaults

- **WHEN** `lexforge/config.yaml` has no `file_limit` section
- **THEN** the limit is 400 lines and covers the files of the default list

#### Scenario: A project sets its own number

- **WHEN** `lexforge/config.yaml` holds `file_limit: { lines: 330 }`
- **THEN** the limit is 330 lines and still covers the files of the default list

#### Scenario: A project's list replaces the default one

- **WHEN** `lexforge/config.yaml` holds `file_limit: { include: ["src/**/*.ts"] }`
- **THEN** the limit covers only files matching `src/**/*.ts`, and a `.py` file anywhere in
  the project is not covered

### Requirement: The default list covers source files and tests

The default list SHALL cover files with the extensions `ts`, `tsx`, `js`, `jsx`, `mjs`,
`cjs`, `py`, `go`, `rs`, `java`, `kt`, `kts`, `swift`, `rb`, `php`, `cs`, `c`, `h`, `cc`,
`cpp`, `hpp`, `scala`, `vue` and `svelte`, wherever they lie, tests included.

The default list SHALL NOT cover Markdown, JSON, YAML or lock files.

#### Scenario: A test file is covered by default

- **WHEN** a project with no `file_limit` section has `tests/login.test.ts`
- **THEN** the limit covers `tests/login.test.ts`

#### Scenario: Documentation is not covered by default

- **WHEN** a project with no `file_limit` section has `README.md` and `package-lock.json`
- **THEN** the limit covers neither of them

### Requirement: Lines are counted the way `wc -l` counts them

The line count of a file SHALL be the number of newline characters in it, the number
`wc -l` prints for the same file. A file SHALL be over the limit when its count is greater
than the limit; a count equal to the limit SHALL be within it.

#### Scenario: A file at the limit is within it

- **WHEN** the limit is 400 and a covered file holds 400 newline characters
- **THEN** the file is within the limit

#### Scenario: One line more is over it

- **WHEN** the limit is 400 and a covered file holds 401 newline characters
- **THEN** the file is over the limit

### Requirement: Growth is measured against the start of the change

The state of a file at the start of a change SHALL be its content in the commit that brought
the change directory into the repository. A file absent from that commit SHALL be a new
file.

#### Scenario: A file's start count comes from the base commit

- **WHEN** `src/billing.ts` held 612 lines in the commit that added the change directory, and
  holds 640 lines now
- **THEN** its start count is 612 and it has grown by 28 lines during the change

#### Scenario: A file the base commit lacks is new

- **WHEN** `src/billing/refunds.ts` does not exist in the commit that added the change
  directory
- **THEN** it is a new file, and the limit applies to it in full

### Requirement: Each of the two paths names what a touched file must end as

A change SHALL follow one of two paths for covered files already over the limit.

On the `refactor` path, every covered file the change touches SHALL end the change within
the limit.

On the `keep` path, a covered file the change touches that was within the limit at the start
SHALL end within the limit, and a covered file that was over the limit at the start SHALL end
with no more lines than it had at the start.

A new covered file SHALL end within the limit on either path.

#### Scenario: A long file is split on the refactor path

- **WHEN** a change on the `refactor` path touches `src/billing.ts`, 612 lines at the start
- **THEN** `src/billing.ts` ends the change at 400 lines or fewer

#### Scenario: A long file stays as it is on the keep path

- **WHEN** a change on the `keep` path touches `src/billing.ts`, 612 lines at the start, and
  it ends at 605 lines
- **THEN** the file keeps to its path

#### Scenario: A long file grows on the keep path

- **WHEN** a change on the `keep` path touches `src/billing.ts`, 612 lines at the start, and
  it ends at 640 lines
- **THEN** the file breaks its path

#### Scenario: A short file crosses the limit on the keep path

- **WHEN** a change on the `keep` path touches `src/cart.ts`, 380 lines at the start, and it
  ends at 420 lines
- **THEN** the file breaks its path
