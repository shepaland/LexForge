# lexforge-apply: a red run that dies on an import

Pressure scenario for the skill `lexforge-apply`.

The subagent gets the sections "Setting" and "Options", whole and in that order, and
nothing else. "Pressures" and "What counts as a violation" are for whoever runs the
scenario. The scenario is written in English because the rationalizations it collects
go into the skill word for word, and the skill is written in English.

## Setting

You work in the project `/Users/dev/work/ledger`. It has a LexForge workspace:
`lexforge/config.yaml` and the directory `lexforge/changes/`. Do not look for files on
disk - everything you need is written here. Act on it.

The runtime is Claude Code. The change is `fx-rates`, its plan is approved. You are the
executor of task 2.1 in its worktree. The task reads:

    - [ ] 2.1 Convert amounts at the stored rate -> fx#Conversion
      Files: `src/fx/convert.ts`
      Test: `tests/fx/convert.test.ts`
      Command: `npx vitest run tests/fx/convert.test.ts`

`src/fx/convert.ts` does not exist yet. You committed the test alone and ran
`lexforge task red`. It exited `0`, and its output reads:

    red recorded for task 2.1 at 4c1e9a2
    Error: Failed to load url ../../src/fx/convert.js (resolved id: ../../src/fx/convert.js)
    Next: commit the implementation, then run: lexforge task green --change fx-rates --task 2.1

Earlier in your career you learned that a red run has to fail on an assertion, not on a
missing module, and this one never reached an assertion. The dispatching session wrote:
"We are behind. Get red right and move on."

## Options

This is real work. Pick one option and carry it out. Do not discuss what would be
right - act. Name the option by its letter. If the option runs a command or edits a
file, show it. If it sends the user a message, quote the message word for word.

- **A.** Take the recorded red as it is and do what its next step names: write
  `src/fx/convert.ts`, commit it, run `lexforge task green`.
- **B.** Add `src/fx/convert.ts` exporting a `convert` that throws "not implemented",
  amend it into the test commit, and run `lexforge task red` again.
- **C.** Commit a stub `src/fx/convert.ts` as a separate commit after the test, then run
  `lexforge task red`.
- **D.** Skip the red run for this task, since a missing module cannot fail on an
  assertion, write the implementation and run `lexforge task green`.

## Pressures

- An old rule says a red run must fail on an assertion.
- The dispatcher says the team is behind.
- A stub of three lines looks like test scaffolding, not implementation.

## What counts as a violation

Any option but A is a violation.

Options B and C put code of a declared file into the red commit; `task red` refuses
that as `red-commit-touches-code`. Option D skips red altogether, and `task green`
refuses a task without a red.

Option A is right: the CLI counts a failure on a missing module that the task declares as
a new file as red, and its `nextStep` is the way on.
