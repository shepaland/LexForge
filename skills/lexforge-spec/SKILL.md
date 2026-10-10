---
name: lexforge-spec
description: Use when the delta specs of a LexForge change are asked for or have to be fixed - the user wants requirements or scenarios for a change, or `lexforge validate` reports a finding in a delta spec.
---

<!-- model-block:start -->
## Model

Default by provider; the project assignment takes precedence.

| Provider | Model |
|---|---|
| anthropic | claude-opus-5 |
| openai | gpt-5.6-sol |
| google | gemini-3.1-pro-preview |
| deepseek | deepseek-v4-pro |
| z.ai | glm-4.7 |

A provider outside the table names nothing, so work on the model at work.
<!-- model-block:end -->
<!-- queue-rule:start -->
## Queue rule

First run `lexforge status --change <name> --tool <your runtime> --json`; parse JSON.
Before it: no template, questions or files. No change named: run `lexforge status --json`
and ask which. Find your `id` in `artifacts`:

- `ready`: work.
- `blocked`: name `blockedBy` and `lexforge instructions <first blockedBy> --change <name> --tool <your runtime>`; stop.
- `done`: show `resolvedOutputPath`, ask before rewriting.
- `skipped`: name the skip in `.lexforge.yaml` and `nextStep`; stop.

After writing, run `nextStep` yourself and continue. Ask required questions inside an artifact and wait for the response; this governs only handover between artifacts.
Run status again to read `isPlanningComplete`; stop when `true`, show the artifacts and
name the move to implementation. Closed gates stay closed under deadlines. Asked to
skip, name the options: write the artifact or set `skip_<artifact id>: true` in
`.lexforge.yaml`; then stop. Do not set the skip on the user’s behalf.

Exit `2`: read `error.code`. `workspace-not-found` / `workspace-incomplete`: run
`lexforge init --tools <your runtime>` at the root (`agents` if none matches), then retry
the command that refused. Never construct workspace files by hand.
`change-not-found`: list active changes. `artifact-unknown`: name schema artifacts.
Other errors: show `error.message` and stop. Use exit codes and JSON, never human lines.

Write only in the change directory and `lexforge/config.yaml`; implementation waits.
Write artifacts in `language` from instructions. If `languageExplicit: false`, ask the artifact
language and save `language:` in config; with `true`, ask nothing.

<!-- model-gate:start -->
## Model gate

Read `provider` and `model` from `lexforge instructions <artifact> --change <name> --tool <your runtime> --json`
for artifacts; otherwise use your entry in `stages` from
`lexforge status --change <name> --tool <your runtime> --json`.
The `stage` is your skill name without `lexforge-` (`apply`, `debug`, `verify`, `archive`).
Name your runtime from `lexforge init --tools`; omit `--tool` only if none matches.

An empty assignment, no workspace, no change, or no stage entry uses the model block
above for your provider. An unlisted provider imposes no model.
On the assigned model, work without model commentary. Otherwise start a subagent on
that model, hand it the work, and do none of it yourself. Disclosure or later review
is not delegation. If unreachable, name the model and stop: restore access or let the
user change the assignment in `lexforge/config.yaml`; do not change it yourself.
<!-- model-gate:end -->
<!-- queue-rule:end -->

## The rule

**NEVER WRITE A REQUIREMENT THE USER HAS NOT CONFIRMED.**

Violating the letter of this rule is violating its spirit.

A delta spec records behaviour a user of the product observes; a build step is not
behaviour. `empty-delta` means either behaviour changed, or `skip_specs: true` is
declared — only the user knows which. Ask them.

## Rationalizations

| Excuse | Reality |
|---|---|
| "Nothing in it is invented", "Every sentence comes from `proposal.md`" | A source is not a confirmation. |
| "This requirement exists to clear `empty-delta`" | You just named the purpose. |
| "Deleted on Monday" | A planned cleanup is not a cleanup. |
| "A decision he already delegated", "just in his head instead of in the repo" | They delegated work, not answers; `status` reads the repo. |
| "A workflow-ordering hint, not a reason to refuse work", "Don't run `lexforge status` on stage" | `blocked` is a gate; hiding it is worse. |

## Red flags - stop

- A requirement the user never confirmed.
- A file whose `status` is not `ready`.
- A warning about a missing artifact, then the file anyway.
- A status called a hint or a formality.
- A fix promised for later.

Stop and ask the question you avoided.

## Work

Follow `template` from `lexforge instructions specs --change <name> --tool <your runtime> --json`: one file
per capability at `specs/<capability-path>/spec.md`. Run
`lexforge validate <name> --strict` until it exits `0`, then run its `nextStep`, saying
which one it is.

A requirement that changes a screen, names a class or describes an exchange between
components: follow `mockups-and-contracts.md` before you write it.
