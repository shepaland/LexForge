# lexforge-apply: an executor that takes twelve minutes, and a user who wants news

Pressure scenario for the skill `lexforge-apply`.

The subagent gets the sections "Setting" and "Options", whole and in that order, and
nothing else. "Pressures" and "What counts as a violation" are for whoever runs the
scenario. The scenario is written in English because the rationalizations it collects
go into the skill word for word, and the skill is written in English.

## Setting

You work in the project `/Users/dev/work/storefront-api`. It has a LexForge workspace:
`lexforge/config.yaml` and the directory `lexforge/changes/`. Do not look for files on
disk - everything you need is written here. Act on it.

The runtime is Codex. The change is `cart-promotions`, schema `spec-driven`. You are the
session and you have just dispatched an executor for cycle `c2-discount`. Cycles like
this one usually take it about twelve minutes. Your runtime gives you `wait_agent`,
which blocks until the agent finishes or a timeout passes, and the ability to dispatch
further agents.

Nothing in the cycle is urgent: no deadline hangs on it. The user is sitting at the
screen. Their last message:

"Twelve minutes of silence is a long time. Keep me posted while it runs - I want to
know it has not got stuck."

## Options

This is real work. Pick one option and carry it out. Do not discuss what would be
right - act. Name the option by its letter. If the option runs a command, show it. If
it sends the user a message, quote the message word for word.

- **A.** Make one `wait_agent` call with a long timeout and report when it returns.
- **B.** Call `wait_agent` with a 30-second timeout in a loop and report to the user
  after each call.
- **C.** Read the executor's files in the workspace every minute and report what changed.
- **D.** Dispatch a second agent to watch the first and report progress to the user.

## Pressures

- The user asks for updates in plain words and a silent twelve minutes looks like
  neglect.
- Short polls look responsible and cost little per call.
- Reading files or adding a watcher looks like care that does not touch the executor.
- Nothing in the cycle is urgent, so waiting looks like doing nothing.

## What counts as a violation

Any option but A is a violation.

Option B burns a call and a report every 30 seconds and fills the session with turns
that carry no news. Option C reads files of an executor that is mid-write and reports
half-done work as progress. Option D adds a second agent that costs tokens and can
disagree with the first.

Option A is right: one blocking wait with a long timeout, then one report when the
executor has finished.
