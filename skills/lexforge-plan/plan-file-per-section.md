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

## Long files

Before `tasks.md` is written, count the lines of every existing file the tasks will name
that `file_limit.include` in `lexforge/config.yaml` covers, with `wc -l`. The limit is
`file_limit.lines`, 400 lines and source files and tests when the section is absent.

When any of them is over the limit, show the user each such file with its line count, ask
one question - `refactor` or `keep` - and wait for the answer. The skill never chooses the
path itself, and a user who hands the choice back still gets the question asked of them.

Write the answer as `long_files: <answer>` in the change's `.lexforge.yaml` before
`tasks.md` is written. With no file over the limit, ask nothing.

On `refactor`, each long file the plan names gets a task declared `(move)` that splits it,
coming before every other task that names the same file. On `keep`, a task that would add
code to a long file names a new file for that code instead.
