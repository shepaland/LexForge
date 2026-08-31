# delta-merge

## Purpose

How a change's delta gets into the long-lived spec at
`lexforge/specs/<capability-path>/spec.md`: what form the main spec takes, in what order
the four operations apply, what counts as a conflict, and why running the merge again is
safe.

## Requirements

### Requirement: The main spec has a fixed form

The file `lexforge/specs/<capability-path>/spec.md` SHALL consist of a heading
`# <capability-path>`, a `## Purpose` section, and a `## Requirements` section, inside
which sit blocks `### Requirement: <name>` with scenarios `#### Scenario: <name>`.

The main spec SHALL NOT carry the delta operation headings (`## ADDED Requirements` and the
other three): an operation describes a transition, while the main spec describes current
behavior.

The merge SHALL keep the order of requirement blocks the operations do not touch, and SHALL
append new blocks at the end of the `## Requirements` section.

#### Scenario: A capability's first archival

- **WHEN** a change is archived whose delta opens the capability `user-auth` with three
  requirements
- **THEN** the file `lexforge/specs/user-auth/spec.md` appears, with a heading, a `Purpose`
  section from the delta, and three requirement blocks under `## Requirements`

#### Scenario: An added requirement

- **WHEN** one new requirement merges into a spec that already has four
- **THEN** the four earlier blocks stay in place in their earlier order, and the new one
  lands last

### Requirement: The four operations apply in a fixed order

The merge SHALL apply the operations in the order RENAMED, REMOVED, MODIFIED, ADDED.

The order SHALL be part of the contract: renaming ahead of the rest lets one change rename
a requirement and change its text under the new name in the same pass, and applying ADDED
last stops a new requirement from taking a name that a rename just freed up.

#### Scenario: A rename and a change in the same change

- **WHEN** a delta renames a requirement and, in its MODIFIED section, changes it under the
  new name
- **THEN** both operations apply, and the spec ends up with one block, under the new name,
  with the new text

#### Scenario: An addition under a freed-up name

- **WHEN** a delta renames requirement `A` to `B` and adds a new requirement `A`
- **THEN** both operations apply, and the spec ends up with two blocks: `B` with the old
  text and `A` with the new text

### Requirement: Each operation checks its own precondition

The merge SHALL report a conflict when an operation's precondition is not met:

- ADDED names a name already taken in the main spec;
- MODIFIED, REMOVED, or RENAMED FROM names a name absent from the main spec;
- RENAMED TO names a name already taken in the main spec;
- two operations in the same delta name the same requirement.

The conflict text SHALL name the operation, the capability, the requirement's name, and the
reason. When a name is not found but a close spelling exists in the spec, the text SHALL
name that one too: the usual mismatch is a case or a space.

#### Scenario: Changing a requirement that does not exist

- **WHEN** a MODIFIED section names a requirement absent from the main spec
- **THEN** the merge reports a conflict and names the requirement and the capability

#### Scenario: A close name

- **WHEN** a name in the delta differs from the name in the spec by one space
- **THEN** the conflict text names the close match it found and suggests fixing the
  heading

#### Scenario: A requirement in two sections

- **WHEN** one requirement sits in both REMOVED and RENAMED
- **THEN** the merge reports a conflict and applies neither operation

### Requirement: MODIFIED does not drop scenarios

The MODIFIED operation SHALL replace the requirement's block whole.

The merge SHALL report a conflict when the main spec's version of the requirement has a
scenario the incoming block lacks: a whole-block replacement would otherwise drop proven
behavior silently.

#### Scenario: A scenario missing from the incoming block

- **WHEN** the main spec's requirement has three scenarios, and the MODIFIED section
  carries two
- **THEN** the merge reports a conflict and names the missing scenario

#### Scenario: A scenario rewritten

- **WHEN** the incoming block carries the same scenario names with different text
- **THEN** the block is replaced whole, with no conflict

### Requirement: A rename is recorded as a FROM/TO pair

The section `## RENAMED Requirements` SHALL carry pairs of lines in this form:

```
- FROM: `### Requirement: old name`
- TO: `### Requirement: new name`
```

Strict artifact validation SHALL report a finding on a rename section with no FROM/TO pair,
on a pair with an empty name, and on two pairs with the same FROM or the same TO. A
malformed rename shows up on `lexforge validate <change> --strict`, well before archival.

A requirement block headed `### Requirement:` inside the rename section SHALL count as a
malformed rename: names are taken only from the `FROM` and `TO` lines.

#### Scenario: A pair missing its other half

- **WHEN** the rename section has a `FROM` line with no `TO` line after it
- **THEN** `lexforge validate <change> --strict` reports a finding with the line number

#### Scenario: Two renames from the same name

- **WHEN** two pairs name the same old name
- **THEN** strict mode reports a finding and names both lines

### Requirement: A spec that does not exist yet accepts only ADDED

The merge SHALL create the main spec file when the delta's capability is not yet in
`lexforge/specs/`, and SHALL take the `## Purpose` section from the delta spec.

MODIFIED, REMOVED, and RENAMED on a spec that does not exist SHALL become a conflict: there
is nothing to change or remove.

A delta spec with no `## Purpose` section, when creating a new capability, SHALL become a
conflict: a spec with no stated purpose is unreadable to whoever opens it a year later.

#### Scenario: A new capability with a change

- **WHEN** a delta opens a new capability and carries a MODIFIED section
- **THEN** the merge reports a conflict and names the operation and the capability

#### Scenario: A new capability without Purpose

- **WHEN** a delta opens a new capability, and it has no `## Purpose` section
- **THEN** the merge reports a conflict and names the delta spec file

### Requirement: Merging the same text again does not count as a conflict

An ADDED operation whose requirement already sits in the main spec with a
character-for-character matching block SHALL go through with no file change and no
conflict. The same SHALL hold for MODIFIED and for a RENAMED whose result is already
recorded.

The rule exists for re-runs: a merge wrote the spec files but did not get to moving the
change directory, and a second run has to finish the job.

A REMOVED operation whose name is absent from the spec SHALL go through with no conflict,
when the rest of that capability's delta is already recorded in the spec in full and
carries at least one ADDED, MODIFIED, or RENAMED operation. A delta made of nothing but
REMOVED leaves no trace to recognize a repeat by, and a missing name in it SHALL stay a
conflict.

A block with the same name and different text SHALL stay a conflict.

#### Scenario: A second run after a failure

- **WHEN** a merge already wrote the specs, the directory move did not happen, and the
  command is called again
- **THEN** the merge goes through with no conflicts, the spec files stay as they are, and
  the directory moves

#### Scenario: A removal in a delta made only of REMOVED

- **WHEN** a delta carries only a REMOVED section, and the named requirement is absent from
  the spec
- **THEN** the merge reports a `removed-name-missing` conflict

#### Scenario: Same heading, different text

- **WHEN** a requirement with this name already sits in the spec, and the block's text
  differs
- **THEN** the merge reports a conflict

### Requirement: A conflict stops the whole merge

The merge SHALL be fully evaluated before any write to disk, and SHALL NOT write a single
file once at least one conflict is found.

The reply SHALL carry every conflict found at once, not just the first one: fixing one
conflict per run would turn archival into a slog.

The exit code on conflicts SHALL be `1`; the change directory stays in place.

#### Scenario: Three conflicts in two capabilities

- **WHEN** a delta produces three conflicts across two spec files
- **THEN** the command ends with exit code `1`, prints all three, and touches no file

#### Scenario: A conflict after fixing the delta

- **WHEN** a conflict is resolved by editing the delta spec, and the command is called
  again
- **THEN** the merge goes through, and the specs are written
