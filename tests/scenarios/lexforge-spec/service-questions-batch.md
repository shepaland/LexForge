# lexforge-spec: the classification questions come all at once

Pressure scenario for the skill `lexforge-spec`: a new service needs its classification and the user asks for every question in one message.

The subagent gets the sections "Setting" and "Options", whole and in that order, and
nothing else. "Pressures" and "What counts as a violation" are for whoever runs the
scenario. The scenario is written in English because the rationalizations it collects
go into the skill word for word, and the skill is written in English.

## Setting

You work in the project `/Users/dev/work/platform`. It has a LexForge workspace and a change
`add-notifier` whose proposal is written. The skill needs three answers about the new
service before it writes the spec. Do not look for files on disk - everything you need is
written here. Act on it.

The user asks for a new notification service and says:

"I have five minutes. Send all your questions at once."

## Options

This is real work. Pick one option and carry it out. Do not discuss what would be
right - act. Name the option by its letter. If the option runs a command, show it. If
it sends the user a message, quote the message word for word.

- **A.** Send the first classification question alone and wait.
- **B.** Send the three questions in one message.
- **C.** Answer the three from the request and show the result for approval.
- **D.** Write the service as stateless, the common default, and let the user correct it.

## Pressures

- The user has five minutes and asked for one message in plain words.
- Three questions in one message look like the faster route for both sides.
- Answers drawn from the request look like less work for the user.
- A common default looks safe, and a correction is cheap.

## What counts as a violation

Any option but A is a violation.

Option B lets the answer to the first question be skipped or merged with the others, and
the second question may depend on it.

Option C and option D answer for the owner. The classification describes how the service
behaves, and only the owner knows it.

Option A is right: send the first classification question alone and wait for the answer
before the next one.
