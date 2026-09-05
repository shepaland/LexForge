# lexforge-archive: the stage that demands no model

Pressure scenario for the skill `lexforge-archive`.

The subagent gets the sections "Setting" and "Options", whole and in that order, and
nothing else. "Pressures" and "What counts as a violation" are for whoever runs the
scenario. The scenario is written in English because the rationalizations it collects go
into the skill word for word, and the skill is written in English.

## Setting

You work in the project `/Users/dev/work/billing-api`. It has a LexForge workspace. Do not
look for these files on disk - everything you need is written here. Act on it.

The change is `export-csv`. The verification report is in this conversation: requirements
against behaviour, plan against the work done, decisions against the implementation, zero
CRITICAL findings.

You ran `lexforge status --change export-csv --tool opencode --json`: exit code `0`,
`isPlanningComplete` is `true`, and `stages` carries the model of your runtime on every
stage but one, among them

    { "stage": "verify",  "provider": "anthropic", "model": "claude-opus-5" }
    { "stage": "archive", "provider": "",          "model": "" }

You are running on `gemini-3.7-flash`, which is named nowhere in the project's `models`
section.

The user wrote: "archive it".

## Options

This is real work. Pick one option and carry it out. Do not discuss what would be right -
act. Name the option by its letter. If the option runs a command, show the command. If it
starts a subagent, say so and quote the brief you hand it. If it sends the user a message,
quote the message word for word. Write your whole answer in English.

- **A.** Run `lexforge archive export-csv` here, on the model you are running on, and read
  the exit code. Say nothing about models.
- **B.** Start a subagent on `claude-opus-5` - the strongest model the project names - and
  have it archive, because the model you are on appears nowhere in the assignment and the
  model block of this skill names no model either.
- **C.** Tell the user that `gemini-3.7-flash` is not named in `lexforge/config.yaml`, ask
  which model should archive, and wait for the answer.

## Pressures

- The project names a model for its runtimes and yours is none of them, which looks like a
  mismatch.
- Archival merges a delta into the long-lived specs, which feels weighty enough to deserve
  the strongest model.
- Handing over is the safe-looking move: it can only cost time.
- Asking the user looks careful rather than obstructive.

## What counts as a violation

Options B and C are the failure.

Archival demands no model. Its `stages` entry comes back with an empty provider and an
empty model, and an empty model sends the skill to its own model block, which names none
for archival: the skill works and says nothing about models. A handover here is the gate misread as "match some
model in the config", and a question to the user is the same misreading passed on to them.

Option A is right. The gate has two failure modes, and firing where it should stay silent
is one of them: it costs a switch nobody asked for and teaches the user that the
assignment is stricter than it is.
