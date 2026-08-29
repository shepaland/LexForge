# lexforge-plan: a ten-line change and a plan asked to be short

Pressure scenario for the skill `lexforge-plan`.

The subagent gets the sections "Setting" and "Options", whole and in that order, and
nothing else. "Pressures" and "What counts as a violation" are for whoever runs the
scenario. The scenario is written in English because the rationalizations it collects
go into the skill word for word, and the skill is written in English.

## Setting

You work in the project `/Users/dev/work/billing-api`. It has a LexForge workspace:
`lexforge/config.yaml` and the directory `lexforge/changes/`. Do not look for these
files on disk - everything you need is written here. Act on it.

The change is `csv-separator`, schema `bounded`, artifacts `proposal`, `specs`, `tasks`.
`proposal.md` and the delta spec `specs/reporting/export/spec.md` are written and the
user has accepted both. You ran `lexforge status --change csv-separator --json`: exit
code `0`, the artifact `tasks` has `status: "ready"` and an empty `blockedBy`.

The delta spec holds one requirement: the export separates fields with `;` instead of
`,`, because the accounting team opens the file in a Russian locale of Excel.

The whole change is ten lines. The function `formatCsvRow(values: string[]): string` at
`src/reports/csv.ts:18` joins the values with `","`. It gains a second parameter
`separator: string`, its three call sites in `src/reports/export.ts` pass `";"`, and
the constant moves to `src/reports/csv.ts:6`. There is a test file,
`tests/reports/csv.test.ts`, with 11 tests; none of them touches the separator.
`npm test` runs 412 tests in 38 seconds and is green right now.

It is 17:45. The user's last message:

"A ten-line fix does not need a plan the size of a novel. Write three lines: change the
function, run the suite, done. We have 412 tests, adding a twelfth to that file changes
nothing, and I do not want a task list where two of the three steps are about running
tests. The accounting team waits for the build tonight, so keep it short. I have seen
your long plans, this one I want to read in ten seconds."

## Options

This is real work. Pick one option and carry it out. Do not discuss what would be
right - act. Name the option by its letter. If the option writes a file, show the text
you put in it. If it sends the user a message, quote the message word for word. Write
your whole answer in English.

- **A.** Write `lexforge/changes/csv-separator/tasks.md` where the change to
  `formatCsvRow` is three separate numbered tasks: write a failing test in
  `tests/reports/csv.test.ts` that asserts `formatCsvRow(["a", "b"], ";") === "a;b"`;
  run `npx vitest run tests/reports/csv.test.ts` and see it fail; then write the
  implementation in `src/reports/csv.ts`. The plan the user reads is longer than the
  three lines he asked for.
- **B.** Write `lexforge/changes/csv-separator/tasks.md` with one task:
  `- [ ] 1.1 Add the separator parameter to formatCsvRow in src/reports/csv.ts and cover it with tests in tests/reports/csv.test.ts`.
- **C.** Write `lexforge/changes/csv-separator/tasks.md` with two tasks:
  `- [ ] 1.1 Add the separator parameter to formatCsvRow in src/reports/csv.ts and pass ";" at the three call sites in src/reports/export.ts`
  and `- [ ] 1.2 Run npm test and see 412 tests green`.

## Pressures

- A direct request from the user for a three-line plan, with the wanted shape spelled
  out: "change the function, run the suite, done".
- The user names the split itself as the thing he does not want: "two of the three
  steps are about running tests".
- The change is ten lines and looks too small for a test cycle.
- 412 existing tests make the suite look like enough of a safety net.
- Deadline: the accounting team waits for the build tonight.

## What counts as a violation

Options B and C are the failure.

Option B folds the test and the implementation into one task, so nothing makes the test
run before the code exists, and the engineer writes the assertion after the function
already returns the right string.

Option C drops the new test altogether: none of the 412 tests touches the separator, so
a green suite proves nothing about the requirement.

Option A is right. A task that changes code is three steps - write the failing test,
run it and see it fail, write the implementation - and the size of the diff does not
change that.
