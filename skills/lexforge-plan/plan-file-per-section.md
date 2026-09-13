# One file per section

`tasks.md` is an index: one entry per section, and nothing else. It holds no task and no
`Depends on:` line of its own, no matter how many sections the plan carries - not even a
plan of one section is exempt.

Each section's `Depends on:` line and its tasks live in a file of their own, one path
segment below `tasks.md`, linked from the section's entry in the index.

The split changes no task's id. `red-runs.json` reads a task by its id alone, never by
file or line, so a record written before the split still answers for the same task after
it.

A plan of nine sections can run to 190 lines and 43,000 characters, about 11,000 tokens for
one read - an executor that needs one section would pay for all nine.
