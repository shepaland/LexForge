# engineering-rules

## Purpose

Engineering rules say what correct backend code, frontend code and tests look like, and
what a review checks. The executor reads them before it writes code and the reviewer
blocks a wave on a violation. The CLI picks the rules that apply to the files of a cycle,
so a brief carries only those.

## Requirements

### Requirement: A rule is a heading with four fields

A rule file SHALL hold rules as `### <ID>` headings, each followed by the fields `Rule`,
`Sign`, `Applies to` and `Source`, every one written as `- **<Field>:** <value>`.

`Rule` SHALL state the rule in at most 240 characters. `Sign` SHALL name what a reader
sees in a diff when the rule is broken, in at most 240 characters. `Applies to` SHALL list
one or more file globs. `Source` SHALL name where the rule comes from, or `-` when it has
no outside source.

An ID SHALL be at most 16 characters and SHALL match `<PREFIX>-<NN>`, where the prefix is
one of `BE`, `FE`, `TS`, `RV`, `NODE`, `PY`, `JVM`, `GO`, `NET`, `PHP`, `RB`, `RS`, `REACT`,
`VUE`, `NG`, `SVELTE` for shipped rules and `P` for rules a project adds.

#### Scenario: A complete rule

- **WHEN** a rule file holds `### BE-02` with `Rule`, `Sign`, `Applies to: **/*.ts` and
  `Source: OWASP Top 10 A03`
- **THEN** the rule is read with all four fields

#### Scenario: A rule without a sign

- **WHEN** a rule heading `### P-01` has no `Sign` field
- **THEN** reading the file fails with an error naming `P-01`, the file and the line of
  the heading

#### Scenario: A rule text over the limit

- **WHEN** the `Rule` field of `P-02` holds 241 characters
- **THEN** reading the file fails with an error naming `P-02` and the limit of 240

### Requirement: The package ships four sections and twelve stack additions

The package SHALL ship the general sections backend (`BE`), frontend (`FE`), testing (`TS`)
and review (`RV`), and one addition per stack: `node`, `python`, `jvm`, `go`, `dotnet`,
`php`, `ruby` and `rust` for backend, `react`, `vue`, `angular` and `svelte` for frontend.

Every shipped rule SHALL carry all four fields, and no two shipped rules SHALL share an ID.

#### Scenario: The catalog reads cleanly

- **WHEN** the CLI reads the shipped rule files
- **THEN** it finds the four sections and the twelve additions, with no reading error and
  no duplicate ID

#### Scenario: An addition names its stack

- **WHEN** the `python` addition is read
- **THEN** every rule in it has the prefix `PY` and globs that match Python files

### Requirement: A project names its stacks

A project SHALL name its stacks in `lexforge/config.yaml` under `engineering.stacks` as a
list of stack names from the twelve shipped ones.

The general sections SHALL apply to every project. A stack addition SHALL apply only when
its stack is named in `engineering.stacks`. The CLI SHALL NOT guess a stack from file
extensions.

#### Scenario: A stack not named

- **WHEN** `engineering.stacks` is `[python]` and the files of a cycle include `app.tsx`
- **THEN** no `REACT` rule is selected, while matching `FE` rules are

#### Scenario: No stacks at all

- **WHEN** `lexforge/config.yaml` has no `engineering` key
- **THEN** only the general sections apply

### Requirement: The CLI selects the rules for a set of files

`lexforge rules --change <name> --files <path>...` SHALL print the rules whose
`Applies to` globs match at least one of the given files, after project overrides and
switched-off rules are applied. Each printed rule SHALL carry its ID, `Rule` and `Sign`,
and SHALL leave out `Source` and `Applies to`.

`TS` rules SHALL be selected only when a given file is a test file under the globs of a
`TS` rule. `RV` rules SHALL be selected for every set of files and SHALL be marked with
the audience `reviewer`; every other rule SHALL be marked `both`.

With `--json` the output SHALL be one JSON document as described in the contract below.
More than 60 selected rules SHALL be an error with exit code `1` that names the count
and tells the user to split the task. More than 200 given files SHALL be an error with exit
code `1` and error code `files-too-many` that names the count and tells the user to split
the task.

Interaction: dispatcher -> cli, cli -> dispatcher

```sequence
dispatcher -> cli: select
cli -> dispatcher: selection
```

| Message | From | To | Field | Type | Required | Length | Response | Errors |
|---|---|---|---|---|---|---|---|---|
| select | dispatcher | cli | change | string | yes | 1..64 | selection | change-not-found |
| select | dispatcher | cli | files | array | yes | 1..200 | selection | files-too-many, rules-too-many |
| select | dispatcher | cli | path | string | yes | 1..1024 | selection | path-too-long |
| selection | cli | dispatcher | rules | array | yes | <=60 | - | - |
| selection | cli | dispatcher | id | string | yes | 1..16 | - | - |
| selection | cli | dispatcher | rule | string | yes | 1..240 | - | - |
| selection | cli | dispatcher | sign | string | yes | 1..240 | - | - |
| selection | cli | dispatcher | audience | string | yes | 1..8 | - | - |

#### Scenario: A Python file in a Python project

- **WHEN** `engineering.stacks` is `[python]` and the command runs with `--files api/orders.py`
- **THEN** the output holds the matching `BE` and `PY` rules and every `RV` rule, and no
  `FE` or `TS` rule

#### Scenario: A test file joins the set

- **WHEN** the files are `src/cart.ts` and `src/cart.test.ts`
- **THEN** the output holds matching `TS` rules as well

#### Scenario: Too many rules

- **WHEN** the files of a task match 61 rules
- **THEN** the command exits `1` with error code `rules-too-many` and names 61

#### Scenario: Too many files

- **WHEN** the command runs with 201 paths after `--files`
- **THEN** it exits `1` with error code `files-too-many` and names 201

#### Scenario: No source in the output

- **WHEN** the command prints `BE-02`
- **THEN** the line holds its ID, rule and sign, and not the text of its `Source`

### Requirement: A project rule with a shipped ID replaces the shipped rule

A project SHALL add rule files under `lexforge/rules/*.md` in the same format. A project
rule whose ID equals a shipped ID SHALL replace that shipped rule as a whole, all four
fields included. A project rule with a `P` prefix SHALL be added to the catalog.

#### Scenario: An override

- **WHEN** `lexforge/rules/backend.md` holds `### BE-05` with a different `Rule`
- **THEN** `lexforge rules` prints the project's `Rule` for `BE-05` and never the shipped one

#### Scenario: A project rule

- **WHEN** `lexforge/rules/team.md` holds `### P-01` with `Applies to: src/billing/**`
- **THEN** `P-01` is selected for `src/billing/invoice.ts` and not for `src/cart.ts`

### Requirement: A switched-off rule never reaches a brief

A project SHALL switch a rule off in `lexforge/config.yaml` under `engineering.disabled`
as a map from rule ID to a reason of at most 200 characters. A switched-off rule SHALL NOT
be printed by `lexforge rules`, whatever the files.

#### Scenario: A rule switched off

- **WHEN** `engineering.disabled` holds `FE-14: "the product has one language"`
- **THEN** `FE-14` is absent from the output for every set of files

### Requirement: Status reports whether the project named its stacks

`lexforge status --json` SHALL carry a field `engineeringStacks`: the string `missing` when
`lexforge/config.yaml` has no `engineering.stacks` key, and otherwise the list of stacks,
which MAY be empty.

#### Scenario: No stacks key

- **WHEN** `lexforge/config.yaml` has no `engineering.stacks` key
- **THEN** `lexforge status --json` holds `"engineeringStacks": "missing"`

#### Scenario: An explicit empty list

- **WHEN** `engineering.stacks` is `[]`
- **THEN** `lexforge status --json` holds `"engineeringStacks": []`

### Requirement: The CLI saves the project's stacks

`lexforge stacks set <stack>...` SHALL write the given stacks to `engineering.stacks` in
`lexforge/config.yaml`, keeping the rest of the file as it was. `lexforge stacks set --none`
SHALL write an empty list. A stack outside the twelve shipped ones SHALL be refused with exit
code `1`, naming the stack and the twelve known ones, and SHALL leave the file unchanged.

#### Scenario: Two stacks

- **WHEN** `lexforge stacks set python react` runs
- **THEN** `engineering.stacks` is `[python, react]` and the comments and other keys of the
  file are unchanged

#### Scenario: No stack

- **WHEN** `lexforge stacks set --none` runs
- **THEN** `engineering.stacks` is `[]`

#### Scenario: An unknown stack

- **WHEN** `lexforge stacks set elixir` runs
- **THEN** the command exits `1`, names `elixir` and the twelve known stacks, and the file is
  unchanged

### Requirement: A new change waits until the stacks are named

`lexforge new change` SHALL refuse with exit code `2` and error code
`engineering-stacks-missing` while `engineering.stacks` is absent, and its `nextStep` SHALL
name `lexforge stacks set <stack>...` and `lexforge stacks set --none`. An empty list SHALL
let the change start.

The shared queue-rule block of the skills SHALL tell the agent, on `engineeringStacks:
"missing"` or on `engineering-stacks-missing`, to ask the user which of the twelve stacks the
project uses, to wait for the answer and to save it with `lexforge stacks set`. The agent
SHALL NOT choose the stacks itself or write them into `lexforge/config.yaml` by hand.

#### Scenario: Stacks not named

- **WHEN** `engineering.stacks` is absent and `lexforge new change add-auth` runs
- **THEN** the command exits `2` with `engineering-stacks-missing`, creates no change, and
  `nextStep` names `lexforge stacks set`

#### Scenario: Stacks answered with none

- **WHEN** `engineering.stacks` is `[]` and `lexforge new change add-auth` runs
- **THEN** the change is created

#### Scenario: The agent asks instead of guessing

- **WHEN** the agent runs `lexforge status --json`, reads `"engineeringStacks": "missing"`,
  and the repository holds only Python files
- **THEN** the agent asks the user which stacks apply and runs `lexforge stacks set` with the
  user's answer, not with a stack it inferred
