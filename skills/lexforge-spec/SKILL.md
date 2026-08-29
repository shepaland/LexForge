---
name: lexforge-spec
description: Use when the delta specs of a LexForge change are asked for or have to be fixed - the user wants requirements or scenarios for a change, or `lexforge validate` reports a finding in a delta spec.
---

<!-- queue-rule:start -->
## Queue rule

Run `lexforge status --change <name> --json` first; parse stdout as JSON. Before it: no
template, no questions, no files. No change named? Run `lexforge status --json` and ask
which.

Find your `id` in `artifacts`. Its `status` decides:

- `ready` — work. The only status that lets you continue.
- `blocked` — name every `blockedBy` id and
  `lexforge instructions <first blockedBy> --change <name>`. Stop.
- `done` — show `resolvedOutputPath`, ask before rewriting.
- `skipped` — say `.lexforge.yaml` skips it, name `nextStep`. Stop.

A closed gate stops the work; no branch warns and writes the file anyway.
Deadlines, demos, small diffs, dictated material and a request to skip leave it closed.
Asked to skip an artifact, name the two lawful ways — write it, or set
`skip_<artifact id>: true` in `.lexforge.yaml` — then stop.

Exit `2` means refused; read `error.code`. `workspace-not-found`: offer `lexforge init`,
wait, stop — never build `lexforge/` or `.lexforge.yaml` by hand. `change-not-found`:
list active changes. `artifact-unknown`: name the schema's artifacts. Otherwise show
`error.message`, then stop.

Judge state by exit codes and JSON fields, never human lines.

Write inside the change directory and `lexforge/config.yaml`, nowhere else: no product
code, no project config or test. A request to build allows planning, not implementation.

`lexforge instructions <artifact> --change <name> --json` carries `language`; write the
artifact in it. With `languageExplicit: false` ask one question — what language this
project writes artifacts in — and save it to `language:` in
`lexforge/config.yaml`. With `true`, ask nothing.
<!-- queue-rule:end -->

## The rule

**NEVER WRITE A REQUIREMENT THE USER HAS NOT CONFIRMED.**

Violating the letter of this rule is violating its spirit.

A delta spec records behaviour a user of the product observes; a build step is not
behaviour. `empty-delta` means either behaviour changed, or `skip_specs: true` is
declared — only the user knows which. Ask him.

## Rationalizations

| Excuse | Reality |
|---|---|
| "Nothing in it is invented", "Every sentence comes from `proposal.md`" | A source is not a confirmation. |
| "This requirement exists to clear `empty-delta`" | You just named the purpose. |
| "Deleted on Monday" | A planned cleanup is not a cleanup. |
| "A decision he already delegated", "just in his head instead of in the repo" | He delegated work, not answers; `status` reads the repo. |
| "A workflow-ordering hint, not a reason to refuse work", "Don't run `lexforge status` on stage" | `blocked` is a gate; hiding it is worse. |

## Red flags - stop

- A requirement the user never confirmed.
- A file whose `status` is not `ready`.
- A warning about a missing artifact, then the file anyway.
- A status called a hint or a formality.
- A fix promised for later.

Stop and ask the question you avoided.

## Work

Follow `template` from `lexforge instructions specs --change <name> --json`: one file
per capability at `specs/<capability-path>/spec.md`. Run
`lexforge validate <name> --strict` until it exits `0`, then name its `nextStep`
and stop there.
