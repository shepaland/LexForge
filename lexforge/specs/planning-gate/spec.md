# planning-gate

## Purpose

The queue rule and how skills behave on CLI failures: check status before work, stop on any
status other than `ready`, no soft gates, error codes handled by code, and one question about
artifact language.

## Requirements

### Requirement: Work starts with a status check

The artifact skill SHALL run `lexforge status --change <name> --json` as its first action and
find its own artifact by the `id` field in the `artifacts` array.

Before this check, the skill SHALL NOT read the template, ask questions about the task, or
write files.

#### Scenario: First action of the skill

- **WHEN** the artifact skill `design` fires
- **THEN** the first command it runs is `lexforge status --change <name> --json`

#### Scenario: Change name is unknown

- **WHEN** the skill fires and no change name has been given in the conversation
- **THEN** the skill runs `lexforge status --json`, shows the active changes, and asks the
  user to pick one

### Requirement: Any status other than `ready` stops the skill

The skill SHALL continue only when its artifact's status is `ready`.

At status `blocked`, the skill SHALL name the contents of the `blockedBy` field and the
command `lexforge instructions <first open artifact> --change <name>`, then stop.

At status `done`, the skill SHALL show the path from `resolvedOutputPath` and ask whether to
overwrite the finished artifact.

At status `skipped`, the skill SHALL report that the artifact is declared skipped in
`.lexforge.yaml`, then stop.

#### Scenario: Artifact is blocked

- **WHEN** the artifact skill `tasks` sees its own status as `blocked` with `blockedBy`
  holding `specs` and `design`
- **THEN** the skill names both artifacts, names the command for the first one, and does not
  write `tasks.md`

#### Scenario: Artifact is already written

- **WHEN** the skill sees its own artifact's status as `done`
- **THEN** the skill shows the file path and asks whether to overwrite it

#### Scenario: Artifact is declared skipped

- **WHEN** the change carries `skip_specs: true`, and the artifact skill `specs` fires
- **THEN** the skill reports the skip, names the next artifact, and stops

### Requirement: Gates don't open on a warning

Closed gates SHALL stop the work. There is no mode where the skill reports a violation and
keeps going.

Task urgency, a small edit size, the agent's confidence that the skipped artifact is obvious,
and a direct user request to skip a step SHALL NOT open the gate. When asked to skip a step,
the skill names the legitimate way: write the artifact, or declare it skipped with
`skip_<artifact id>: true` in `.lexforge.yaml`.

#### Scenario: User asks to skip an artifact

- **WHEN** the user asks to write `tasks.md` right away, without delta specs
- **THEN** the skill refuses, names the two legitimate ways, and stops

#### Scenario: Urgency

- **WHEN** the user says the deadline is close and asks to start with the plan
- **THEN** the skill's answer does not change: the gate stays closed

### Requirement: State is read from the exit code and the machine response

The skill SHALL determine change state from the command's exit code and from the fields of
its `--json` response.

The skill SHALL NOT parse human-readable output lines: their wording changes between versions
and is not a contract.

#### Scenario: Checking an artifact before writing

- **WHEN** the skill needs to know whether it can write the artifact
- **THEN** it reads the `status` field from the machine response instead of looking for a
  word in the human-readable output

#### Scenario: Checking after writing

- **WHEN** the skill finishes the delta specs and runs `lexforge validate <name> --strict --json`
- **THEN** readiness is decided by the exit code: `0` means done, `1` means there are
  findings, `2` means the command could not run

### Requirement: A command failure is handled by its error code

At exit code `2`, the skill SHALL read the `error.code` field of the machine response and act
on it.

Code `workspace-not-found` SHALL mean there is no workspace: the skill names `lexforge init`,
asks for permission, and stops. Code `change-not-found` SHALL lead to showing the active
changes. Code `artifact-unknown` SHALL mean the artifact is not in this change's schema: the
skill names the schema's artifacts and stops.

The skill SHALL NOT create workspace directories or the `.lexforge.yaml` file by hand,
bypassing the commands.

#### Scenario: No workspace

- **WHEN** the very first command returns exit code `2` with `error.code` set to
  `workspace-not-found`
- **THEN** the skill offers to run `lexforge init`, waits for an answer, and does not create
  the `lexforge/` directory itself

#### Scenario: Artifact is not in the schema

- **WHEN** artifact `design` is requested for a change on schema `bounded`
- **THEN** the skill reports that schema `bounded` has no such artifact, and names
  `proposal`, `specs`, `tasks`

### Requirement: Artifact language is asked once

A skill that gets `languageExplicit: false` from `lexforge instructions <artifact> --change
<name> --json` SHALL ask the user one question about the project's artifact language and
record the answer as the `language` field in `lexforge/config.yaml`.

At `true`, the question SHALL NOT be asked. Artifacts are written in the language from the
`language` field.

#### Scenario: Language not chosen

- **WHEN** the instructions command's response carries `languageExplicit: false`
- **THEN** the skill asks one question about language, records the answer in
  `lexforge/config.yaml`, and continues

#### Scenario: Language already chosen

- **WHEN** the instructions command's response carries `languageExplicit: true` and
  `language` set to `ru`
- **THEN** no question is asked, the artifact is written in Russian

### Requirement: The model gate fires when the model differs

A skill SHALL read the role, the provider and the model before it writes anything, and SHALL
compare that model against the model it is running on.

The assignment SHALL be read from the answer the queue rule already asks for: a skill that
writes an artifact reads the instructions response of that artifact, and a skill that carries
a stage writing no artifact reads the entry of its own stage in the status response.

The two matching, the skill SHALL work without a word about models. An empty assignment SHALL
demand nothing. Only a difference SHALL open the gate.

#### Scenario: The assigned model is at work

- **WHEN** the instructions response names a model, and the skill is running on that model
- **THEN** the skill goes on to write the artifact and asks for no handover

#### Scenario: A skill that writes no artifact

- **WHEN** a skill that carries a stage writing no artifact starts on a change
- **THEN** it reads the model of its own stage from the status response and needs no other
  call

#### Scenario: Two roles on the same model

- **WHEN** two stages in a row resolve to the same model through different roles
- **THEN** no handover happens between them

#### Scenario: An empty assignment

- **WHEN** the answer carries an empty provider and an empty model
- **THEN** the skill demands no model and writes the artifact

### Requirement: A handover starts a subagent on the assigned model

Running on a model other than the assigned one, the skill SHALL hand the artifact to a
subagent started on the assigned model, and SHALL write no file itself.

The gate SHALL name the handover without naming the runtime that carries it out, because the
same text ships to every runtime the skills are installed for.

Asking the user to switch models and come back SHALL NOT count as a handover, and neither
SHALL writing the artifact after naming the assigned model.

#### Scenario: Another model is at work

- **WHEN** the instructions response names a model the skill is not running on
- **THEN** the skill starts a subagent on that model, hands it the artifact, and writes
  nothing itself

#### Scenario: A handover offered as a request

- **WHEN** the skill is pushed to name the assigned model and let the user switch by hand
- **THEN** the skill still starts the subagent, because a request is not a handover

### Requirement: An unavailable model stops the work

A skill that cannot reach the assigned model - the runtime cannot start a subagent on it, or
the provider is out of reach - SHALL stop: it names the assigned model, says it cannot be
reached, and writes no file.

The skill SHALL NOT ask for permission to write the artifact on the model it is running on,
and SHALL NOT write it after saying the model is unavailable.

#### Scenario: The runtime cannot start the model

- **WHEN** a subagent cannot be started on the assigned model in the runtime at hand
- **THEN** the skill names it, reports that it cannot be reached, and stops without writing
  the artifact

#### Scenario: A deadline pressed on the skill

- **WHEN** the assigned model is unavailable and the user asks to write the artifact anyway
  because of a deadline
- **THEN** the skill still writes no file and names the two ways out: make the model
  reachable, or change the assignment in `lexforge/config.yaml`
