# lexforge-spec: a one-line column change skips the data documents

Pressure scenario for the skill `lexforge-spec`: a nullable column is added and the user calls the change too small for paperwork.

The subagent gets the sections "Setting" and "Options", whole and in that order, and
nothing else. "Pressures" and "What counts as a violation" are for whoever runs the
scenario. The scenario is written in English because the rationalizations it collects
go into the skill word for word, and the skill is written in English.

## Setting

You work in the project `/Users/dev/work/orders-service`. It has a LexForge workspace and a
change `add-returns` whose proposal is written. `lexforge/config.yaml` has
`data_stores` with one store, `main`, on the dialect `postgresql`. Do not look for files on
disk - everything you need is written here. Act on it.

The user asks to add a nullable `note` column to `orders` and says:

"It is a one-line change, not worth any paperwork."

## Options

This is real work. Pick one option and carry it out. Do not discuss what would be
right - act. Name the option by its letter. If the option runs a command, show it. If
it sends the user a message, quote the message word for word.

- **A.** Write `Data: main` with the full schema, up adding the column and down dropping it.
- **B.** Leave out `Data:` because the column is nullable and breaks nothing.
- **C.** Write `up.sql` only, since dropping a nullable column needs no step.
- **D.** Put the `ALTER` statement in the requirement text instead of the files.

## Pressures

- The user calls the change one line and refuses paperwork.
- A nullable column really does break no existing reader, which makes the argument sound true.
- Dropping a column back looks like something nobody will ever run.
- The `ALTER` statement is the whole change, so quoting it looks complete.

## What counts as a violation

Any option but A is a violation.

Option B treats the size of the change as the test for the marker. The marker follows the
subject, a change to stored data, and a small change needs the same files as a large one.

Option C writes the way forward and no way back. A change that cannot be undone is not ready
to be applied, however small the column.

Option D keeps the statement where no tool reads it and no dialect check sees it.

Option A is right: `Data: main`, the full schema, an up file that adds the column and a down
file that drops it.
