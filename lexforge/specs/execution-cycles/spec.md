# execution-cycles

## Purpose

Workflow 2 runs a change as behavioural cycles with recorded RED, GREEN and review. This
capability fixes how many reviews a wave takes, what a re-review covers and where edits
outside the plan are caught, so that a cycle is not restarted for work it does not own.

## Requirements

### Requirement: One review covers a wave

`lexforge cycle review --change <name> --wave <section> --file <report>` SHALL register one
review report for every cycle of the section that has no `controls`.

The command SHALL refuse when a cycle of the wave lacks current GREEN, when the report
misses an acceptance ID of any covered cycle, or when the reviewer equals the executor of
any covered cycle. The refusal SHALL name the cycle and the missing item.

#### Scenario: A wave of three cycles

- **WHEN** the three cycles of section `ingest` each have current GREEN and the report names
  every acceptance ID of the three
- **THEN** the report is registered once and each of the three cycles can be closed

#### Scenario: One cycle of the wave is not green

- **WHEN** cycle `ingest-schema` of the wave has no current GREEN
- **THEN** the command refuses and names `ingest-schema`

### Requirement: A cycle with controls keeps its own reviewer

A cycle whose `controls` list is not empty SHALL NOT be covered by a wave report. It SHALL be
reviewed by its own report that names every control, as `lexforge cycle review --cycle`.

#### Scenario: Authorization inside a wave

- **WHEN** a wave report is registered and one cycle of the section declares
  `authorization`
- **THEN** that cycle stays open until its own report naming `authorization` is registered

### Requirement: A cycle closes on its wave review

`lexforge cycle close` SHALL accept a cycle covered by an approved wave report registered on
its current GREEN, or, for a cycle with controls, its own approved report. Blocking
findings of the report that point at the cycle SHALL keep it open.

#### Scenario: A finding in a neighbouring cycle

- **WHEN** the wave report holds an open important finding on cycle `ingest-api` only
- **THEN** cycle `ingest-schema` of the same wave closes, and `ingest-api` does not

### Requirement: A re-review covers the fixes only

After a fix round, `lexforge cycle review` SHALL accept a report marked `"scope": "fixes"`
that names the earlier report. The CLI SHALL hand the reviewer a patch from the state the
earlier report was registered on to the current GREEN, and the report SHALL account for
every blocking finding of the earlier report.

A fixes report SHALL NOT be accepted when the earlier report has no blocking finding.

#### Scenario: Two findings fixed

- **WHEN** the earlier report had findings F1 and F2, both fixed and green, and the fixes
  report marks F1 and F2 resolved
- **THEN** the report is registered and the cycles of the wave can close

#### Scenario: A finding left out

- **WHEN** the fixes report mentions F1 and omits F2
- **THEN** the command refuses and names F2

### Requirement: A scope refusal names the paths

Every refusal of `cycle start`, `cycle run`, `cycle restart`, `verify` and `archive` about
files outside the expected scope SHALL list every offending path and SHALL carry a
`nextStep`.

#### Scenario: Unreviewed edits at verify

- **WHEN** `scripts/tmp.sh` changed outside the files of the execution plan and the user
  runs `lexforge verify`
- **THEN** the refusal lists `scripts/tmp.sh` and names a next step

### Requirement: Edits outside the plan are caught once, at the end

An edit to a path outside the files of the execution plan SHALL NOT refuse `cycle start`,
`cycle run` or `cycle restart`, and SHALL NOT invalidate GREEN or a review.

`lexforge verify` and `lexforge archive` SHALL refuse such an edit, listing its paths.

#### Scenario: A parallel writer outside the plan

- **WHEN** a file outside the execution plan changes between `cycle start` and
  `cycle run --phase green`
- **THEN** the run proceeds, and GREEN and the review stay current

#### Scenario: The same edit at the end

- **WHEN** that edit is still in the tree at `lexforge verify`
- **THEN** verify refuses and lists the path
