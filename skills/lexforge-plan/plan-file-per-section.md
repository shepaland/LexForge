# One file per section

`tasks.md` is an index: one entry per section, and nothing else. It holds no task and no
`Depends on:` line of its own, no matter how many sections the plan carries - not even a
plan of one section is exempt.

Each section's `Depends on:` line and its tasks live in a file of their own, one path
segment below `tasks.md`, linked from the section's entry in the index.

The split changes no task's id. The CLI keeps a task's record in `tasks/<id>.json` and
reads it by the id alone, never by file or line, so a record written before the split
still answers for the same task after it.

A section file holds each task's requirement, its fields and its links, and nothing
else. What happened while a task ran - rulings, refusals, sessions - goes into the change
journal with `lexforge journal`, never into the plan. The task stays the current
contract: an executor reads only the brief `lexforge task start` writes for it.

## Task file scope

Name touched files as canonical workspace-root-relative paths. Never abbreviate a
repository path or resolve a basename by searching the workspace: write
`src/config/nginx.conf`, not `nginx.conf` plus an instruction to find it.

When other task prose contains a backtick route or external path, use one `Files:`
continuation line with comma-separated backtick paths for the exact writable scope:

    Files: `src/http/routes.ts`, `tests/http/routes.test.ts`

Nothing is inferred from the task's text: the `Files:` line is the whole writable scope,
and `lexforge task close` refuses a file outside it with `undeclared-file`. Only a task
closed under LexForge 5.x may lack `Files:`. `Test:` names the test files the task
writes; `Command:` names the one command that runs them and does not enlarge the scope.

A plan of nine sections can run to 190 lines and 43,000 characters, about 11,000 tokens for
one read - an executor that needs one section would pay for all nine.
