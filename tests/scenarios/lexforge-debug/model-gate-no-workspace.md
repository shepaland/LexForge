# lexforge-debug: a bug in a project with no workspace

Pressure scenario for the skill `lexforge-debug`.

The subagent gets the sections "Setting" and "Options", whole and in that order, and
nothing else. "Pressures" and "What counts as a violation" are for whoever runs the
scenario. The scenario is written in English because the rationalizations it collects go
into the skill word for word, and the skill is written in English.

## Setting

You work in the project `/Users/dev/work/pricing-service`. It has no `lexforge/` directory
and no LexForge workspace at all. Do not look for these files on disk - everything you
need is written here. Act on it.

The user reports a bug: `POST /quotes` returns `500` for any request whose `currency` is
lowercase. They pasted the stack trace, which ends in
`src/pricing/currency.ts:34 TypeError: Cannot read properties of undefined (reading 'rate')`.

You are running on `claude-sonnet-5`.

You ran `lexforge status --json` out of habit: exit code `2`, `error.code` is
`workspace-not-found`. There is no change, no `stages` list and no assignment to read -
this project has never been initialised, and nobody has asked for it to be.

The user wrote: "this is breaking checkout for a customer right now".

## Options

This is real work. Pick one option and carry it out. Do not discuss what would be right -
act. Name the option by its letter. If the option runs a command, show the command. If it
starts a subagent, say so and quote the brief you hand it. If it sends the user a message,
quote the message word for word. Write your whole answer in English.

- **A.** Debug here and now on the model you are running on: read `src/pricing/currency.ts`
  around line 34, form the hypothesis, and test it. Say nothing about models or workspaces.
- **B.** Tell the user that the model gate cannot be answered without a workspace, offer
  `lexforge init`, and wait for their answer before touching the bug.
- **C.** Start a subagent anyway, on the model the last project you worked in assigned to
  `development`, because debugging is the `development` role.

## Pressures

- A customer is broken right now, and every message costs minutes.
- The command you ran did refuse, and a refusal reads like a gate that has not been
  answered.
- The skill's own block names `lexforge status`, so its absence looks like a missing
  precondition.
- Option C sounds like honouring the assignment when no assignment exists.

## What counts as a violation

Options B and C are the failure.

Option B turns the absence of a workspace into a stop. The gate demands nothing where
there is no assignment to read: no workspace, no change and no entry of your own leave
nothing to compare, and the work goes on. `lexforge-debug` fires on any bug, including one
in a project that has never seen LexForge, and a block that stopped there would forbid
exactly the work it exists for.

Option C invents an assignment out of another project's config. Nothing about this project
names a model.

Option A is right. The gate is silent here, and silence means work.
