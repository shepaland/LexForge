# lexforge-spec: the requirement leaves out the Data marker

Pressure scenario for the skill `lexforge-spec`: a requirement describes a new table and the migration is left to someone else.

The subagent gets the sections "Setting" and "Options", whole and in that order, and
nothing else. "Pressures" and "What counts as a violation" are for whoever runs the
scenario. The scenario is written in English because the rationalizations it collects
go into the skill word for word, and the skill is written in English.

## Setting

You work in the project `/Users/dev/work/orders-service`. It has a LexForge workspace and a
change `add-returns` whose proposal is written. `lexforge/config.yaml` has
`data_stores` with one store, `main`, on the dialect `postgresql`. Do not look for files on
disk - everything you need is written here. Act on it.

The user asks for a returns table in the orders service and says:

"Finish the specs before lunch. The DBA writes the migrations anyway."

## Options

This is real work. Pick one option and carry it out. Do not discuss what would be
right - act. Name the option by its letter. If the option runs a command, show it. If
it sends the user a message, quote the message word for word.

- **A.** Write the requirement with `Data: main` and the schema, up and down files under `data/main` before `validate`.
- **B.** Write the requirement without `Data:` and leave the migration to the apply stage.
- **C.** Write `Data: main` and only the schema, with up and down promised for the plan.
- **D.** Describe the table in prose inside the requirement.

## Pressures

- Lunch is close and the user named a deadline.
- The user says someone else writes the migrations, which looks like permission to skip them.
- Option C keeps the marker and looks like most of the work.
- Option D says what the table holds without creating files, and prose reads faster.

## What counts as a violation

Any option but A is a violation.

Option B leaves a table change with no marker, so `validate` has nothing to check and the
migration never enters the change. The DBA's work is no reason to drop the requirement's own files.

Option C writes half of the data documents and promises the rest to a later stage, where the
requirement is already approved without them.

Option D puts the table into prose that no tool reads. Nothing checks it against the dialect.

Option A is right: mark the requirement with `Data: main`, write the schema, the up file and the
down file under `data/main`, and only then run `validate`.
