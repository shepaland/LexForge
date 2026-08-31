# evidence-freshness Specification

## Purpose
Stamp freshness: how the state of the code at run time differs from the state of the code now.
A stamp taken ten commits ago confirms work that no longer exists, and a stamp taken before an
edit in the working tree confirms a file that has since been rewritten. This spec records what
the state fingerprint is made of, the five states a label can be in, and how `check evidence`
behaves when no label list is given.

## Requirements

### Requirement: Code state is made of the commit and the working tree

Stamp freshness SHALL be determined by a pair: the workspace's `HEAD` commit and the fingerprint
of the working tree. A stamp counts as taken on the current state when both values match.

The fingerprint of the working tree SHALL be computed from tracked files changed relative to
the index and `HEAD`, and from new files git knows about as untracked. An empty tree with no
edits gives a constant fingerprint.

An uncommitted edit SHALL reset freshness: the run happened against different text, and that is
enough to make a "tests are green" claim stop applying to the code on disk.

#### Scenario: Nothing changed

- **WHEN** no commit and no edit happened after a run of the `tests` label
- **THEN** the label counts as fresh

#### Scenario: New commit

- **WHEN** a commit is made after the run
- **THEN** the label does not count as fresh, and the finding text names the stamp's commit and
  the current `HEAD`

#### Scenario: Edit in the working tree

- **WHEN** the file `src/core/status/change-status.ts` is changed after the run, with no commit
- **THEN** the label does not count as fresh, and the finding text names the working-tree edit

### Requirement: The lexforge directory is excluded from the fingerprint

The fingerprint of the working tree SHALL be computed without the `lexforge/` directory.

Recording a stamp changes `lexforge/changes/<name>/evidence.json`. If that file were part of
the fingerprint, every run would make itself stale, and `check evidence` would never give
code `0`.

For the same reason, editing change artifacts SHALL leave a stamp fresh: `proposal.md` and
`design.md` do not change the behavior of the code.

#### Scenario: Recording a stamp does not reset itself

- **WHEN** a run of the `tests` label wrote `evidence.json`, and nothing else changed
- **THEN** the label counts as fresh right after the write

#### Scenario: Edit to a planning artifact

- **WHEN** the text of `lexforge/changes/add-auth/design.md` is edited after the run
- **THEN** the label stays fresh

#### Scenario: Edit to project code

- **WHEN** a file outside `lexforge/` is changed after the run
- **THEN** the label does not count as fresh

### Requirement: A label has five states

`check evidence` SHALL assign each checked label one of five states:

- `fresh` — a stamp exists, the run was green, and the commit and fingerprint match the current
  ones;
- `failed` — a stamp exists and was taken on the current state, but the run exited non-zero;
- `stale-commit` — the stamp was taken on a different commit;
- `stale-worktree` — the commit is the same, but the fingerprint of the working tree differs;
- `missing` — the ledger has no record for the label.

Every state except `fresh` SHALL become a finding. The finding text SHALL name the label, its
state, and the command that would take a fresh stamp.

There SHALL be no in-between state that gives code `0` for a stale stamp.

#### Scenario: Failed run on the current code

- **WHEN** the `tests` label's stamp was taken on the current commit and carries exit code `1`
- **THEN** the label's state is `failed`, and the command exits with code `1`

#### Scenario: No stamp

- **WHEN** the `lint` label is named in `--require`, and the ledger has no record for it
- **THEN** the label's state is `missing`, and the finding text names
  `lexforge evidence record --change <name> --label lint`

#### Scenario: All labels fresh

- **WHEN** every checked label is in the `fresh` state
- **THEN** the command exits with code `0`

### Requirement: The default label list comes from config

`check evidence` with no `--require` flag SHALL check every label in the `verification` section
of `lexforge/config.yaml`.

The `--require` flag SHALL accept labels separated by commas and narrow the check to the named
ones.

An empty flag value, and a `verification` section with not a single label, SHALL give code `2`:
there is nothing to check, and code `0` here would read to a skill as "checks passed."

#### Scenario: Flag not passed

- **WHEN** the config describes the labels `tests` and `lint`, and `check evidence` is called
  with no `--require`
- **THEN** both labels are checked

#### Scenario: Flag narrows the list

- **WHEN** `check evidence --change add-auth --require tests` is run
- **THEN** only the `tests` label is checked, and the `lint` label's state does not affect the
  exit code

#### Scenario: Empty label list

- **WHEN** `check evidence --change add-auth --require ""` is run
- **THEN** the command exits with code `2` and names the labels described in the project

#### Scenario: No checks described in the project

- **WHEN** the `verification` section is empty, and `check evidence` is called with no
  `--require`
- **THEN** the command exits with code `2` and prints an example `verification` section

### Requirement: A label from --require must be described

A label named in `--require` and absent from the `verification` section SHALL give code `2`.

Such a label can never become fresh by any action: there is nothing to take its stamp from.
Code `1` would send the agent off to fix the plan instead of the config.

#### Scenario: Typo in the label

- **WHEN** `check evidence --change add-auth --require tets` is run
- **THEN** the command exits with code `2`, names the unknown label, and lists the described
  ones

### Requirement: The fingerprint is computed the same way at record time and at check time

The fingerprint of the working tree SHALL be computed by one function, and `evidence record`
SHALL write into the stamp exactly the value `check evidence` would compute on the same tree
state.

File order in the computation SHALL be stable: two computations on an unchanged tree give the
same value.

#### Scenario: Record then check in a row

- **WHEN** `evidence record` and `check evidence` run back to back with no changes on disk
- **THEN** the fingerprint in the stamp matches the one computed at check time

#### Scenario: Computation is repeatable

- **WHEN** the tree fingerprint is computed twice in a row
- **THEN** both values match
