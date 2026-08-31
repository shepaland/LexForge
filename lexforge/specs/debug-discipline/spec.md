# debug-discipline Specification

## Purpose
What `lexforge-debug` does when a test fails unexpectedly or behavior diverges from what
was expected: the order the investigation follows, what counts as a found cause, and when
the conversation moves from a fix to the system's design.

## Requirements

### Requirement: No fix is proposed before the cause is found

The skill SHALL find the cause before naming even one option for a fix.

A cause SHALL count as found once these are named: where the wrong value first appears, the
path it took to the point of failure, and the change after which the behavior became what
it is. A symptom matching a guess SHALL NOT count as a cause.

Urgency, how simple the bug looks, and how obvious the fix looks SHALL NOT lift the rule.

#### Scenario: The fix looks obvious

- **WHEN** the failure looks like a missing check for an empty value
- **THEN** the skill first traces where the empty value came from, and only then names a
  fix

#### Scenario: Treating the symptom at the point of failure

- **WHEN** a check is proposed right where the failure happened
- **THEN** the skill calls this treating the symptom and goes back to finding the source

### Requirement: The investigation runs in four phases

The skill SHALL go through the phases in order and SHALL NOT start the next one before
finishing the current one:

1. Cause: read the full error message, reproduce the failure, look at recent changes, trace
   the path of the wrong value.
2. Comparison: find a working case nearby and list the differences.
3. Hypothesis: state one guess and test it with the smallest possible change.
4. Fix: close the cause with one change.

Testing several hypotheses with one change SHALL NOT be allowed: the result would not show
which one was confirmed.

#### Scenario: Two fixes in one pass

- **WHEN** two changes are made at once, and the test turns green
- **THEN** the changes are split apart, and each is checked separately

#### Scenario: The hypothesis was not confirmed

- **WHEN** the smallest change did not change the behavior
- **THEN** the skill goes back to the first phase with the new data, instead of stacking a
  second change on top

### Requirement: A fix starts with a failing test that reproduces the bug

The fix SHALL come after a test that reproduces the bug and fails on the current code. The
failure SHALL be observed with one's own eyes.

A manual check in the terminal SHALL NOT replace the test: it does not repeat on the next
change.

#### Scenario: The bug reproduces only by hand

- **WHEN** the bug shows up when running the app and no existing test reproduces it
- **THEN** a new test that reproduces it is written, and its failure is observed

#### Scenario: The test is written after the fix

- **WHEN** the fix is made, and the test is written to follow it
- **THEN** this is a violation: a test that never failed before the fix proves nothing

### Requirement: Three failed fixes shift the conversation to the system's design

After three fixes that did not close the bug, the skill SHALL stop and discuss the system's
design with the user: each fix exposed a new connection in a new place, and the next fix
would repeat that.

A fourth fix without such a conversation SHALL NOT be made.

#### Scenario: The third fix did not help

- **WHEN** three fixes in a row each produced a new failure in a new place
- **THEN** the skill names the count of attempts and proposes examining the design, instead
  of trying again

#### Scenario: Every fix demands rewriting more

- **WHEN** the latest fix pulls in a rewrite of the neighboring layer
- **THEN** the skill calls this a sign of a flawed design and stops

### Requirement: Not knowing is said out loud

When the cause is not found, the skill SHALL say so directly and name exactly what remains
unclear.

A plausible explanation SHALL NOT be passed off as the result of the investigation in place
of a found cause.

#### Scenario: The cause is not found

- **WHEN** the investigation has run its course and the path of the wrong value was never
  traced
- **THEN** the skill names the unclear point and asks for help, instead of proposing a fix
  "just in case"

#### Scenario: The bug depends on the environment

- **WHEN** the investigation shows the failure is caused by an external condition
- **THEN** the skill names what was checked, describes the condition, and proposes handling
  it with a log entry
