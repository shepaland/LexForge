# Plan reviewer prompt

The plan is reviewed by four subagents, one per angle, each on the model of the `tasks`
stage. None of them is the session that wrote the plan. Run `lexforge check plan --change
<name>` first: `lexforge plan review` refuses a plan with findings (`plan-check-failing`).

Give each reviewer the brief below with `[ANGLE]` replaced by its angle and only that
angle's section kept under "What to check". Paste the paths; the reviewer reads the files
itself.

## The brief

```
You review the plan of the LexForge change [CHANGE] from one angle: [ANGLE].
You did not write it and you change nothing in it.

Read:
- the plan: lexforge/changes/[CHANGE]/tasks.md and every section file it links;
- the delta specs: lexforge/changes/[CHANGE]/specs/;
- the design, when it exists: lexforge/changes/[CHANGE]/design.md;
- the code the tasks name in `Files:`.

How a task looks: `- [ ] 1.1 <one test cycle>` with `Files:` (the only files it may write),
`Test:` (the test that fails first) and `Command:` (the one command that runs it). A move
carries `(move)` right after its number and has no `Test:`. `Depends on:` and `Controls:`
appear when needed.

What to check:

specs
- Every requirement and every scenario of the delta specs is covered by a task with
  `Test:`, and the task's line names the requirement as `-> <capability>#<requirement>`.
- The test the task names can fail on the behaviour the scenario describes.

code
- Every path in `Files:` and `Test:` is real, or is created by this task or one it
  depends on.
- Interfaces between tasks agree: a function, field or route one task writes is the one
  the next task calls, with the same name and shape.

dependencies
- `Depends on:` is complete: a task that needs another task's output names it.
- Two tasks that do not depend on each other share no file.

gaps
- Inputs and refusals the plan does not test but the owner would expect: empty, missing,
  too large, duplicate, concurrent, unauthorised, a failing dependency.
- Behaviour the delta specs imply but no task carries.

amendment (only when the session asks for it after `lexforge plan amend`)
- The changed tasks: everything above, for those tasks and the tasks that depend on them.

Levels:
- critical: the plan builds the wrong thing or cannot be carried out;
- important: a requirement, refusal or dependency is missing or wrong;
- minor: wording, order, a clearer test name.

Answer with this report and nothing else:

Reviewer: <your id>
Verdict: approved|changes-requested
Controls: none
Findings:
- critical|important|minor: <task id>: <what is wrong and what it should say>

No findings: write `Findings:` and leave the list empty. A critical or important finding
means `Verdict: changes-requested`.
```

## Registering the report

Save each answer to a file and register it under its angle:

    lexforge plan review --change <name> --angle specs --file <report.md>
    lexforge plan review --change <name> --angle code --file <report.md>
    lexforge plan review --change <name> --angle dependencies --file <report.md>
    lexforge plan review --change <name> --angle gaps --file <report.md>
    lexforge plan review --change <name> --angle amendment --file <report.md>

Each run prints `pending` and `nextStep`. A finding: fix the plan, run `lexforge check
plan` again and send that angle a new review; the CLI keeps only reports of the current
plan, so an angle approved before the fix is asked again too. The owner is not asked to
approve until all four angles approved the current plan; `lexforge plan approve` refuses
earlier with `plan-reviews-missing` or `plan-findings-open`.
