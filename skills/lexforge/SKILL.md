---
name: lexforge
description: Use when the user asks for something to be built, added, changed, fixed or looked into in a project and no LexForge change covers it yet - the request names a feature, a bug or a rewrite rather than an artifact of a change that already exists.
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

**A REQUEST TO BUILD ALLOWS PLANNING AND NOT IMPLEMENTATION.**

Violating the letter of this rule is violating its spirit.

Product code, its tests and its config stay untouched, however small the diff. You hand
back a change with its artifacts; implementation starts on the user's next request.

## Work

Name the class in your first message, before your first question:

| Class | What it is | What you do |
|---|---|---|
| spike | a question to answer, not a thing to build | no change; answer and recommend |
| bounded | a flow that is already here, changed | `--schema bounded` |
| architectural | a new subsystem or a shared interface | `--schema spec-driven` |

In doubt take the heavier one.

1. **Say the class out loud** and let the user correct it.
2. **Check the workspace** with `lexforge status --json`.
3. **Propose the name** in kebab-case before running anything: `Add Auth` becomes
   `add-auth`. Exit `2` on a taken name: show that change's status, ask whether to
   continue it or rename. Never write into it.
4. **Run** `lexforge new change <name> --schema <schema>`, then run its `nextStep`,
   saying which one it is.

## The class holds

Nobody lowers a class in flight: not you, not an answer that made the change look
smaller, not a request for the light route. The schema of a live change is not
rewritten, and a `skip_<artifact id>` line is the user's declaration, never your way
around the class. Say what you learned, keep the class, name the next artifact.

## Rationalizations

| Excuse | Reality |
|---|---|
| "The request is one route and one header, the user owns the repo and reviews the diff themselves" | Ownership does not change what was asked for. |
| "Writing product code is the deliverable; a change record here would be paperwork nobody reads" | You priced the artifact before writing it. |
| "Notes on the two judgment calls I made without asking" | Two decisions shipped in code, unseen. |
| "The premise is gone, so the class goes with it. That's the facts changing, not the clock" | New facts belong in the proposal. |
| "No artifacts have been written yet, so nothing is lost by reclassifying" | The artifact you drop is the thing lost. |
| "I'll fall back to `skip_design: true` on `spec-driven`, which drops the same artifact" | You named the workaround yourself. |
| "the design doc you're right to skip", "It's a sentence, not a section" | Sizing an artifact you never wrote is a guess. |

## Red flags - stop

- A file of the product open for editing.
- The class named after your first question, not before it.
- A change name run before the user saw it.
- A `schema:` or `skip_` line you are about to edit.
- A class lighter than the one you announced.

Stop and name the class you announced.
