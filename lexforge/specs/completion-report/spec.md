# completion-report Specification

## Purpose
What the `lexforge-verify` report before archival is made of: which part comes from the
command, which part a person reads, what threshold counts as passing, and why its result is
never saved.

## Requirements

### Requirement: The check starts with the machine part

The skill SHALL run `lexforge verify --change <name> --json` and read the exit code and the
fields `summary` and `findings`.

An exit code of `1` SHALL mean there is work to do: findings get fixed, the command runs
again, and so on until it returns `0`. Reading the exit code SHALL NOT be replaced by
reading the human-readable output lines.

An exit code of `2` SHALL mean the check did not run: the call or the project configuration
gets fixed, and no report is written.

#### Scenario: An open task

- **WHEN** `summary.openTasks` is three
- **THEN** the skill names the three tasks, sees them through, and runs the command again

#### Scenario: An empty verification section

- **WHEN** the command finished with code `2` and a message about an empty `verification`
  section
- **THEN** the skill shows the needed configuration lines and stops

### Requirement: The report covers three dimensions

The report SHALL carry three sections and SHALL NOT collapse them into one:

1. Delta-spec requirements against code behavior: each requirement is named and given a
   verdict.
2. The plan against what was done: closed tasks, freshness of stamps, findings from the
   command.
3. `design.md` decisions against the implementation: each decision is named, along with the
   place in the code where it is followed or broken.

A section with nothing to say SHALL carry a reason, not emptiness.

#### Scenario: All three sections

- **WHEN** the report is ready
- **THEN** it has three sections, and every requirement, every decision, and every label is
  named by name

#### Scenario: A change with the bounded schema

- **WHEN** a change has no `design` artifact
- **THEN** the third section says there are no decisions and names the change's schema

### Requirement: Coherence is read by the skill, because no command is asked to do it

The `notChecked` list from the command's reply SHALL be carried into the report in full,
and a verdict from the skill SHALL sit next to each item.

An exit code of `0` SHALL NOT be taken as a passed check: the command measures open tasks,
requirement traceability, and stamps, while whether the implementation matches the
`design.md` decisions is left to the reader.

#### Scenario: The command returned zero

- **WHEN** `lexforge verify` finishes with code `0`
- **THEN** the skill reads `design.md` and the code and writes the third section of the
  report

#### Scenario: A design.md decision is broken

- **WHEN** the implementation diverges from a decision recorded in `design.md`
- **THEN** this is a CRITICAL finding, even if the command returned `0`

### Requirement: The threshold is zero CRITICAL findings

Report findings SHALL carry the levels CRITICAL, IMPORTANT, and MINOR.

One CRITICAL finding SHALL stop the work: the change is not archived while it stays open.
Promises to fix it after archival, "known limitation" labels, and lowering the level to get
past the check SHALL NOT be allowed.

IMPORTANT findings SHALL be fixed before archival or moved into a separate change with the
user's explicit agreement. MINOR findings SHALL be named by name.

#### Scenario: One CRITICAL finding

- **WHEN** the report carries one CRITICAL finding and ten MINOR ones
- **THEN** archival does not start, and the next step is that finding

#### Scenario: Lowering the level

- **WHEN** a CRITICAL finding is rewritten as IMPORTANT without any code change
- **THEN** this is a violation: the level is set by the consequence, not by convenience

### Requirement: Every claim rests on a fresh run of a command

A claim that tests are green, the linter is clean, or a requirement is met SHALL rest on a
run done in this same message.

The skill SHALL run `lexforge check evidence --change <name> --require <labels>` and read
the exit code. A stamp cleared against a different state of the code SHALL NOT count as
fresh.

#### Scenario: A stamp from an earlier commit

- **WHEN** `check evidence` returns `1` and names the label `tests` as stale
- **THEN** the skill clears the stamp again and only then writes the line about green tests

#### Scenario: Confidence instead of a run

- **WHEN** there was no run in this message
- **THEN** the claim of readiness is not written

### Requirement: The check's result is saved nowhere

The report SHALL go to the user as a message. No file with the check's verdict SHALL be
created.

The `lexforge archive` command SHALL recompute the three machine dimensions itself. A saved
verdict would go stale exactly like a stamp, and would need its own freshness rule.

#### Scenario: Archival after the check

- **WHEN** the report is written, and the archive command is called
- **THEN** it recomputes the three machine dimensions and refuses to work if there are
  findings

#### Scenario: The code changed after the report

- **WHEN** a project file is edited between the report and archival
- **THEN** archival sees a stale stamp and stops
