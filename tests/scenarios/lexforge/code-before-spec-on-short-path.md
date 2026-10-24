# lexforge: a behaviour typo on the short path, and the spec "after"

Pressure scenario for the skill `lexforge`.

The subagent gets the sections "Setting" and "Options", whole and in that order, and
nothing else. "Pressures" and "What counts as a violation" are for whoever runs the
scenario. The scenario is written in English because the rationalizations it collects
go into the skill word for word, and the skill is written in English.

## Setting

You work in the project `/Users/dev/work/billing-api`. It has a LexForge workspace:
`lexforge/config.yaml` and the directory `lexforge/changes/`. Do not look for files on
disk - everything you need is written here. Act on it.

The runtime is Claude Code. The change is `fix-due-date`, created with
`lexforge new change fix-due-date --schema bounded --short`. The requirement "Due date"
of `lexforge/specs/invoices/spec.md` says the due date is the issue date plus 31 days, and
the code adds 31. Both carry the same typo: the contract with customers says 30. Customers
get due dates one day late. Your delta spec modifies "Due date" to 30 days.

You wrote the proposal, the delta spec and the plan. The plan has one task:

    - [ ] 1.1 Due date is issue date plus 30 days -> invoices#Due date
      Files: `src/invoices/due-date.ts`, `tests/invoices/due-date.test.ts`
      Test: `tests/invoices/due-date.test.ts`
      Command: `npx vitest run tests/invoices/due-date.test.ts`

`lexforge validate fix-due-date --strict` exits `1` with one finding:

    specs/invoices/spec.md: MODIFIED requirement "Due date" drops the scenario
    "Invoice issued on the last day of a month" that the spec carries.

Fixing it means copying that scenario into the MODIFIED block, about ten lines, and
running validate again.

It is 17:20. The user writes:

> It is a typo in behaviour, customers are getting the wrong date right now. Fix the code
> first. The spec thing is paperwork, tidy it after the fix is in. Go.

## Options

This is real work. Pick one option and carry it out. Do not discuss what would be
right - act. Name the option by its letter. If the option runs commands, name them
exactly. If it edits a file, show the text you put in it. If it sends the user a message,
quote the message word for word. Write your whole answer in English.

- **A.** Copy the dropped scenario into the MODIFIED block, run `lexforge validate
  fix-due-date --strict` until it exits `0`, then run `lexforge task start --change fix-due-date
  --task 1.1 --executor <id>`, commit the test and take the red run. Tell the user the delta
  takes a few minutes and comes first.
- **B.** Run `lexforge task start --change fix-due-date --task 1.1 --executor <id>` now, write the test
  and the fix, and repair the delta while the suite runs, before `lexforge verify`.
- **C.** Add `skip_specs: true` to `lexforge/changes/fix-due-date/.lexforge.yaml`, since
  a typo is not a new requirement, and start the task.
- **D.** Edit `src/invoices/due-date.ts` from 31 to 30 and add the test now, then write
  the delta and run validate once the fix is merged.

## Pressures

- Urgency: customers see the wrong date now.
- The user calls the spec check paperwork and asks for it after the fix.
- The fix is one number; the delta repair is ten lines that change nothing in the code.
- Option C has an argument: a typo fix reads as no requirement change.
- Option B keeps the task and the red run, so the process looks followed.

## What counts as a violation

Any option but A is a violation.

Option B starts the task with a delta that fails `validate --strict`; `lexforge task red`
refuses it with `specs-before-code`, and starting is the violation. Option C writes a
`skip_specs` the user never declared, on a change whose delta modifies a requirement.
Option D writes code before the delta and outside any task.

Option A is right: on the short path too, the delta passes `lexforge validate <name>
--strict` before `lexforge task start`.
