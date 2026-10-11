# workflow-migration

## Purpose

This capability moves an existing change from workflow 1 to workflow 2 without losing the
meaning of work already performed. It gives people and agents a bounded report before any
write, records imported history without fabricating workflow 2 events, and makes application
recoverable and repeatable.

## Requirements

### Requirement: Migration preview is complete and read-only

`lexforge workflow migrate --change <name> --to 2 --dry-run --json` SHALL analyze the entire
legacy plan and evidence without changing any project or change file. Its machine response
SHALL classify every original task as `historically-confirmed`, `needs-verification`,
`incomplete`, or `conflict`; report dependency and cycle-mapping problems; list the files and
state transitions an apply would make; and provide paths to detailed per-task reasons.

The preview SHALL retain all task IDs and SHALL summarize counts rather than embedding the full
plan or full logs in its default response.

#### Scenario: Mixed change preview

- **WHEN** a legacy change has confirmed tasks, checked tasks with evidence gaps, and open tasks
- **THEN** preview exits without changing files and reports all three classes with counts,
  blocker reasons, and a path to the detailed task records

#### Scenario: Contradictory checkbox and evidence

- **WHEN** a task is checked but its attached check failed or names another revision
- **THEN** preview classifies the task as `conflict` and identifies both facts instead of
  choosing one silently

#### Scenario: Large plan

- **WHEN** preview analyzes a plan with 500 tasks
- **THEN** every task is classified and the default JSON and human summaries contain counts and
  detail paths rather than copies of all task text and logs

### Requirement: Historical confirmation follows an explicit trust policy

A task SHALL be `historically-confirmed` only when the legacy record establishes all of the
following: the exact task ID and acceptance criteria, the code revision or content state to
which the claim applies, successful checks relevant to that task with verifiable stored
evidence, and an independent approving review whose identity, provenance, and covered
acceptance criteria are recorded.

A checked box alone SHALL NOT establish completion. A red record SHALL describe a historical
failure only, a change-level check stamp SHALL describe only its recorded code state, and
neither SHALL be reinterpreted as a workflow 2 cycle run or review. Missing facts SHALL be
reported as named gaps with the minimum additional verification needed to close them.

#### Scenario: Checkbox without evidence

- **WHEN** a legacy task is checked and no task-linked check or review record exists
- **THEN** it is `needs-verification`, with gaps for the missing links, and is not imported as
  confirmed

#### Scenario: Review provenance is incomplete

- **WHEN** checks can be tied to a task and code state but the approving reviewer or covered
  acceptance criteria cannot be established
- **THEN** the task remains `needs-verification` and the report asks for only the missing
  independent review information or review

#### Scenario: Complete legacy record

- **WHEN** a checked task has task and acceptance links, verifiable successful checks for the
  named code state, and a provenance-bearing independent approval covering its criteria
- **THEN** the task is imported as historically confirmed without creating RED, GREEN, cycle
  review, executor, or reviewer events that were not present

### Requirement: Original plan meaning remains traceable

Migration SHALL preserve the original task IDs, task text, acceptance criteria, dependencies,
checkbox states, and legacy evidence references. It SHALL consume `execution-plan.json` as the
explicit behavioural-cycle map and MAY generate mechanical mapping material, but SHALL NOT
require the Markdown task plan to be rewritten solely for migration.

A cycle containing confirmed and unconfirmed tasks SHALL remain open. Its imported tasks SHALL
retain their individual status, and the open part SHALL retain the acceptance criteria and
dependencies needed to continue the behaviour safely.

#### Scenario: Fully incomplete change

- **WHEN** every legacy task is open and the cycle mapping is valid
- **THEN** migration preserves every task and maps all of them to open workflow 2 work

#### Scenario: Partly completed cycle

- **WHEN** one cycle maps three tasks of which two are historically confirmed and one is open
- **THEN** migration preserves all three mappings, keeps the cycle open, and identifies only the
  third task as work to continue

#### Scenario: Missing task in the cycle map

- **WHEN** an original task ID is absent from `execution-plan.json`
- **THEN** preview reports a mapping blocker and apply makes no changes

### Requirement: Evidence gaps close through explicit reconciliation

For a checked task whose implementation already exists but whose legacy record lacks a required
check or independent review, the migration report SHALL name the smallest current verification
needed to resolve each gap. LexForge SHALL be able to record that successful check and an
independent review as a reconciliation of existing work, with their real code state, time,
identity, acceptance coverage, and provenance.

Reconciliation SHALL NOT require a fabricated RED and SHALL NOT be labeled as historical or as
a native workflow 2 implementation cycle. A failed check, rejected review, uncovered acceptance
criterion, or changed input SHALL leave the task unconfirmed.

#### Scenario: Missing legacy review is reconciled

- **WHEN** a checked task has trustworthy task-linked test evidence but no durable review and a
  current independent reviewer approves the existing result against every acceptance criterion
- **THEN** the task becomes confirmed with origin `reconciled`, and the record names the new
  review rather than claiming it existed in workflow 1

#### Scenario: Current reconciliation check fails

- **WHEN** the minimum check proposed for an evidence gap returns nonzero
- **THEN** the task remains open, the failure is recorded as current evidence, and no completion
  event is created

#### Scenario: Inputs change during reconciliation

- **WHEN** the code, mapped task, acceptance criteria, or check inputs change between the check
  and its review
- **THEN** the reconciliation is stale and cannot confirm the task

### Requirement: Apply revalidates and commits migration safely

Migration apply SHALL acquire the existing execution lock, read and validate all inputs before
writing, repeat the same analysis used by preview, and bind the result to digests of the task
sources, cycle map, legacy evidence, relevant code state, and existing migration state.

If any analyzed input changes before commit, if an unexplained user edit would be overwritten,
or if validation finds a blocker, apply SHALL leave workflow 1 active and SHALL NOT expose a
partial historical ledger. The durable historical ledger SHALL be installed before
`workflow.json` exposes version 2, and interruption recovery SHALL either complete that exact
prepared result or leave it safe to rerun.

#### Scenario: Input changes after preview

- **WHEN** a task, mapping, evidence file, or relevant code state changes between preview and
  apply
- **THEN** apply recomputes the analysis under the lock, refuses any now-invalid result, and
  writes no workflow 2 pin based on the older inputs

#### Scenario: Failure during commit

- **WHEN** migration is interrupted after validation but before all target state is durable
- **THEN** the change does not appear as a usable workflow 2 change with missing migration
  state, and the next run reports or recovers the prepared attempt

#### Scenario: Active execution

- **WHEN** another execution command holds the change lock
- **THEN** migration refuses without modifying the change and names the existing lock

### Requirement: Migration is deterministic and idempotent

For identical analyzed inputs, migration SHALL produce the same classifications and durable
historical records regardless of how many times preview or apply is run. Applying an already
applied identical migration SHALL succeed as a no-op and SHALL NOT duplicate evidence,
attempts, or provenance.

A workflow 2 change without a matching migration record SHALL retain its existing workflow 2
semantics and SHALL NOT be treated as a legacy migration candidate.

#### Scenario: Apply is repeated

- **WHEN** the same successful migration command is run twice without input changes
- **THEN** the second call reports an already-applied no-op and leaves every persisted byte or
  semantic record unchanged

#### Scenario: Native workflow 2 change

- **WHEN** migration is requested for a change created directly on workflow 2
- **THEN** the command refuses or reports it already native without creating a legacy record
