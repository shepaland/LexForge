# Task sizing

A task is sized so that one cycle finishes it and the suite is green when the cycle ends.

A task whose work has no point partway through it where the suite is green is not written
as one task: it is cut into steps, each of which leaves the suite green when it ends.

Where the work replaces a structure already in use, those steps keep the old structure and
the new one side by side until the last step: the new path is added first, callers move to
it one at a time in the steps that follow, and the old path is removed only in the final
step.

A task naming work with no such midpoint is a plan defect, not a task that needs a larger
budget: it is cut into steps, and a bigger budget is not offered as the fix.

## Move declaration

A task whose whole work is carrying existing code from one file to another, without
changing behaviour, carries `(move)` right after its group label: `- [ ] 3.2 [B] (move)
...`. The label groups tasks into one agent's run, and `(move)` follows it because that
is the one place a reader checks for the declaration - nowhere else on the line counts.

Such a task is not written as the usual triple - a test, a red run, an implementation -
because a move has no run to watch fail: the failing test a triple opens with would test
behaviour nobody is changing. A move is written as one task, whole.

A task adding a branch, a field or a rule, however small, changes behaviour, so it never
carries `(move)` and keeps the triple that comes with a red run. A move left undeclared
stops the change at `verify`, because the check reads the declaration alone to decide
whether a red record is owed - and a task declared a move that does change behaviour
passes that same check when it should have failed, since the check trusts the declaration
and never rereads the diff. Neither risk is closed by guessing: `(move)` is not written
just in case, or because the work merely resembles a move.

## Example

A task read "collapse the dialogue into one FSM state" - four states and three
back-handlers replaced, six questions moved onto a graph, and seventy-odd tests reworked,
all at once. Three dispatched agents in a row blew their budget on it, and two left broken
drafts behind. Cut into four steps by the strangler pattern, each leaving the suite green,
it cost one extra day and gave four points where work could stop, be reviewed, and be
committed.
