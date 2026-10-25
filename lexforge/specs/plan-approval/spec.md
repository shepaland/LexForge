# plan-approval

## Purpose

The gate between the plan and the code. Four reviewers read the plan from four angles, the owner
approves it in their own words, and the CLI fixes the plan and the base commit at that moment.
A task does not start on a plan that nobody approved or that changed after approval, and the
plan changes during implementation only through an amendment that is reviewed again.

## Requirements

### Requirement: Four plan reviews precede approval

`lexforge plan review --change <name> --angle <angle> --file <report.md>` SHALL register a plan
review report for one of the angles `specs`, `code`, `dependencies` and `gaps`, with its
reviewer, verdict, findings and the plan digest it saw. The angle `amendment` SHALL be accepted
only while an amendment of an approved plan waits for its review, and SHALL be refused with
`no-amendment-pending` otherwise. The command SHALL refuse with `unknown-angle` for any other
angle and with `plan-check-failing` while `lexforge check plan` reports a finding.

`lexforge plan approve` SHALL refuse with `plan-reviews-missing` and name the angles without an
approving review of the current digest, and with `plan-findings-open` and name the angles whose
latest review holds a critical or important finding. Such findings are closed by editing the
plan, and every angle is then reviewed again on the new digest.

#### Scenario: The first of four reviews

- **WHEN** the `specs` reviewer registers an approving report
- **THEN** the review is recorded, the answer lists `code`, `dependencies` and `gaps` as pending,
  and `nextStep` is `lexforge plan review --change demo --angle code --file <report.md>`

#### Scenario: An approving review with an important finding

- **WHEN** the latest `gaps` review approves the current digest but holds an important finding
- **THEN** `plan approve` refuses with `plan-findings-open`, names `gaps`, and records no approval

#### Scenario: An amendment review with nothing amended

- **WHEN** the plan was never amended and a review with `--angle amendment` is registered
- **THEN** the command refuses with `no-amendment-pending`

#### Scenario: A review of an older plan

- **WHEN** all four angles approved, then `tasks.md` changed, and `plan approve` runs
- **THEN** the command refuses with `plan-reviews-missing` and names all four angles

### Requirement: Approval records the owner's words, the plan digest and the base

`lexforge plan approve --change <name> --quote "<owner's words>"` SHALL record the quote, the
digest of the plan and the base commit. The digest SHALL cover the text of `tasks.md` and of
the section files it links to, and SHALL NOT change when a task is ticked. The command SHALL
refuse with `quote-required` on an empty quote and with `work-before-approval` while the working
tree or the change branch differs from the base outside `lexforge/changes/<name>/`.

#### Scenario: The owner says yes

- **WHEN** every angle approved the current digest and the owner answered "да"
- **THEN** the approval holds the quote "да", the digest and the base, and `nextStep` is
  `lexforge task start --change demo --task 1.1 --executor <id>`

#### Scenario: Code written before approval

- **WHEN** `src/notes.js` is changed in the working tree before approval
- **THEN** `plan approve` refuses with `work-before-approval` and names `src/notes.js`

#### Scenario: A tick does not void the approval

- **WHEN** `task close` ticks task `1.1` after approval
- **THEN** the plan digest is unchanged and the approval stays valid

### Requirement: No task starts on an unapproved or changed plan

`task start` SHALL refuse with `plan-not-approved` and the next step
`lexforge plan approve --change <name> --quote "<owner's words>"` when the plan has no approval,
and with `plan-changed` and the next step
`lexforge plan amend --change <name> --quote "<owner's words>"` when the current digest differs
from the approved one.

#### Scenario: No approval

- **WHEN** the plan of `demo` was never approved and `task start` runs
- **THEN** the command refuses with `plan-not-approved`

#### Scenario: The plan edited after approval

- **WHEN** a task text in `tasks.md` changed after approval
- **THEN** `task start` refuses with `plan-changed` and names `lexforge plan amend`

### Requirement: The plan changes mid-implementation through an amendment

`lexforge plan amend --change <name> --quote "<owner's words>"` SHALL accept the current digest
as the approved one and record the quote and the tasks that changed. It SHALL refuse with
`closed-task-changed` when the text of a closed task differs from the approved text, and with
`plan-unchanged` when the digest is the approved one. After an amendment, `task start` SHALL
refuse with `amendment-not-reviewed` until a review with `--angle amendment` approves the
amended digest and holds no critical or important finding. The amendment review reads the tasks
that changed.

#### Scenario: A missing task added

- **WHEN** the owner agrees to add task `3.4` and the plan is amended with the owner's quote
- **THEN** the amendment is recorded and `nextStep` is
  `lexforge plan review --change demo --angle amendment --file <report.md>`

#### Scenario: A closed task rewritten

- **WHEN** the text of closed task `1.1` was changed in `tasks.md`
- **THEN** `plan amend` refuses with `closed-task-changed`

#### Scenario: A task started before the amendment review

- **WHEN** the plan was amended and no `amendment` review approved it
- **THEN** `task start` refuses with `amendment-not-reviewed`
