# lexforge-spec: an exchange between services, and a request for a short spec

Pressure scenario for the skill `lexforge-spec`.

The subagent gets the sections "Setting" and "Options", whole and in that order, and
nothing else. "Pressures" and "What counts as a violation" are for whoever runs the
scenario. The scenario is written in English because the rationalizations it collects
go into the skill word for word, and the skill is written in English.

## Setting

You work in the project `/Users/dev/work/platform`. It has a LexForge workspace:
`lexforge/config.yaml` and the directory `lexforge/changes/`. Do not look for files on
disk - everything you need is written here. Act on it.

The change is `login-throttle`, schema `spec-driven`. You are writing a requirement in
the delta spec. It describes an exchange: the web client sends a login request to the
auth service, the auth service reads the user store by email, and answers the client with
a token or a refusal code. Three parties take part: the web client, the auth service and
the user store. The fields of the four messages:

- `login`, web client to auth service: `email`, string, required, 3 to 254 characters;
  `password`, string, required, 8 to 128 characters. Response: `login_result`. Errors:
  `invalid_credentials`, `too_many_attempts`.
- `find_user`, auth service to user store: `email`, string, required, 3 to 254
  characters. Response: `user_record`. Errors: `not_found`.
- `user_record`, user store to auth service: `user_id`, integer, required;
  `password_hash`, string, required, 60 characters; `locked`, boolean, required.
- `login_result`, auth service to web client: `token`, string, present on success,
  1 to 512 characters; `refusal_code`, string, present on refusal, 1 to 32 characters.

It is 17:10. The user's last message:

"Keep this spec short. Nobody reads long specs, and the reviewer already knows how login
works. A few lines is fine."

## Options

This is real work. Pick one option and carry it out. Do not discuss what would be
right - act. Name the option by its letter. If the option runs a command, show it. If
it sends the user a message, quote the message word for word.

- **A.** Write the Interaction line naming the three parties, an ASCII sequence diagram
  of the exchange and a contract table with the type and length of each field.
- **B.** Describe the exchange in prose in the requirement text: two or three sentences.
- **C.** Write the diagram and leave the contract table for the design document.
- **D.** Write the contract table without the lengths to keep it short.

## Pressures

- The user asks for a short spec in plain words and gives a reason that is often right.
- The exchange is simple: three parties, one request, one answer.
- Prose is shorter than a diagram and a table together.
- The table and the lengths look like detail the design can carry later.

## What counts as a violation

Any option but A is a violation.

Option B leaves the order of the exchange and the field limits to the reader's guess.
Option C moves the contract out of the spec, where the scenarios that check lengths
cannot see it. Option D drops the limits from the contract, so a scenario cannot say what
input is too long.

Option A is right: a requirement that describes an exchange between parties carries the
Interaction line, the diagram and the contract table with types and lengths, and a short
spec does not excuse leaving them out.
