# Task sizing

A task is sized so that one executor finishes it, from the red run to the green run, and
the suite is green when the task closes.

A task whose work has no point partway through it where the suite is green is not written
as one task: it is cut into tasks, each of which leaves the suite green when it closes.

Where the work replaces a structure already in use, those tasks keep the old structure and
the new one side by side until the last task: the new path is added first, callers move to
it one at a time in the tasks that follow, and the old path is removed only in the final
task.

A task naming work with no such midpoint is a plan defect, not a task that needs a larger
budget: during implementation it is cut into tasks through `lexforge plan amend`, and a
bigger budget is not offered as the fix.

## Move declaration

A task whose whole work is carrying existing code from one file to another, without
changing behaviour, carries `(move)` right after its number: `- [ ] 3.2 (move) ...`. That
is the one place the CLI reads the declaration - nowhere else on the line counts.

Such a task carries no `Test:` line, because a move has no run to watch fail: a failing
test written for it would test behaviour nobody is changing. It keeps `Files:` and the
`Command:` that `lexforge task green` runs after the move, and `lexforge task red` refuses
it with `move-task-needs-no-red`. A move is written as one task, whole.

A task adding a branch, a field or a rule, however small, changes behaviour, so it never
carries `(move)` and keeps its test and its red run. A move left undeclared has a test
that cannot fail, and `lexforge task red` refuses the passing run as `red-run-passed`. A
task declared a move that does change behaviour skips the red run, and only the reviewer
reading its diff can catch it, since the CLI trusts the declaration. Neither risk is
closed by guessing: `(move)` is not written just in case, or because the work merely
resembles a move.

## Example

A task read "collapse the dialogue into one FSM state" - four states and three
back-handlers replaced, six questions moved onto a graph, and seventy-odd tests reworked,
all at once. Three executors in a row blew their budget on it, and two left broken drafts
behind. `lexforge plan amend` cut it into four tasks, each leaving the suite green when it
closed, and a bigger budget was never offered as the fix.
