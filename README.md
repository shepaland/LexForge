# LexForge

[![lexforge on npm](https://img.shields.io/npm/v/lexforge.svg)](https://www.npmjs.com/package/lexforge)
[![CI](https://github.com/shepaland/LexForge/actions/workflows/ci.yml/badge.svg)](https://github.com/shepaland/LexForge/actions/workflows/ci.yml)
[![license MIT](https://img.shields.io/npm/l/lexforge.svg)](LICENSE)

**English** · [Русский](README.ru.md)

LexForge helps coding agents meet the same quality requirements on each run and spend fewer
tokens repeating work. Agents get context for their task, save check results and resume where
they left off. Nine skills guide them from the request through tests, review and archive.

![The agent says the change is done; `lexforge verify` answers exit 1 until the checks have actually been run](https://raw.githubusercontent.com/shepaland/LexForge/main/docs/media/verify.gif)

In this example, the agent has written the code and checked off the tasks, but `verify`
returns `1` because the checks have not run. `evidence record` runs them and saves the results.
Then `verify` returns `0`. The example files are in [`examples/notes`](examples/notes).

LexForge takes its requirements documents and their workflow from OpenSpec.
Its testing and review rules come from superpowers.

## Quick start

```bash
npm install -g lexforge       # skills need this command on PATH
lexforge init --tools claude  # agents · claude · codex · cursor · opencode
lexforge doctor               # check the installation
```

Ask the agent to “add X” or “fix Y”. The `lexforge` skill identifies the type of task and
starts the appropriate workflow. See [First run](#first-run) for setup details.

## Changes by version

| Version | What the update gives you |
| --- | --- |
| [3.0.0](CHANGELOG.md#300--2026-10-10) | One reviewer checks a whole wave of cycles, and after fixes only their diff is reviewed again. Refusals name the files involved. Specs carry an ASCII sequence diagram with a contract table for interactions and a mockup for UI; the plan and the executor work against them. Each change runs on `feature/<name>` and is merged into `dev` on archive. |
| [2.2.0](CHANGELOG.md#220--2026-10-03) | Routes and external absolute paths in task descriptions no longer become repository files. An optional `Files:` line gives exact writable scope; existing plans keep working and unsafe explicit paths are rejected. |
| [2.1.0](CHANGELOG.md#210--2026-10-03) | Before running a command in a terminal, the CLI checks for a newer version. Choose to update through npm or continue with the installed version; scripts and JSON output run without a prompt. |
| [2.0.0](CHANGELOG.md#200--2026-10-03) | Moving to the new workflow preserves confirmed work so the agent can finish what remains. Tokens are not spent repeating accepted tasks; missing checks run separately. |
| [1.7.0](CHANGELOG.md#170--2026-10-02) | Agents read context for the current task group. Logs and history stay in files. Each cycle requires tests and independent review, and another agent can continue from saved results. |
| [1.6.0](CHANGELOG.md#160--2026-09-20) | Files are limited to 400 lines by default. Smaller files let agents read the relevant code and check an edit without loading a large file in full. |
| [1.5.0](CHANGELOG.md#150--2026-09-13) | A failing test must actually be run. Executors cannot spawn more agents; they read their part of the plan and work within a token budget. |
| [1.4.0](CHANGELOG.md#140--2026-09-11) | Independent plan sections run in parallel after dependency and shared-file checks. Review findings are saved; serious issues must be fixed, while minor ones can wait. |
| [1.3.0](CHANGELOG.md#130--2026-09-05) | Skills provide default models, with project overrides for Claude, Codex and other runtimes. There is no need to repeat setup before each task. |
| [1.2.0](CHANGELOG.md#120--2026-08-31) | You can choose models for planning, coding and review to control the cost of each stage. Token counts depend on the work itself. |
| [1.1.0](CHANGELOG.md#110--2026-08-30) | Windows file reading and command lookup are fixed. Line endings no longer cause checks to miss errors, and agents no longer have to investigate false installation warnings. |
| [1.0.0](CHANGELOG.md#100--2026-08-30) | Requirements, plans and check results stay in the project. Agents use them at each stage; tasks cannot be completed without the required checks. |

Total token use has not yet been compared on equivalent tasks.

Update the CLI and skills together, naming the runtimes you use:

```bash
npm install -g lexforge@latest
lexforge init --tools claude,codex
```

Changes already in progress move to workflow 2 separately. First, check which results can be preserved:

```sh
lexforge workflow migrate --change <name> --to 2 --dry-run --json
```

Follow the [migration instructions](skills/lexforge-apply/execution-v2.md#safe-migration-of-existing-work)
for the remaining steps. If scripts call the CLI, account for the changed `workflow migrate`
response in 2.0.0: read schema fields from `status.workflow`. The [CHANGELOG](CHANGELOG.md)
lists other compatibility changes and requirements for older plans.

## Supported platforms

| What | Value |
| --- | --- |
| Operating system | Linux, macOS and Windows; the suite runs on all three in CI |
| Node.js | 20.19.0 or newer, the version from `engines`; CI covers 20.19 and 22 |
| Agent runtime | `agents`, `claude`, `codex`, `cursor`, `opencode` |
| git | a repository with at least one commit and a `dev` or `main` branch; without it `new change`, `evidence record`, `check evidence`, `verify` and `archive` answer `2`. `lexforge init` needs none |

Windows supports CRLF line endings and command lookup through `PATHEXT`.
Paths in responses use `/`. The `lexforge.cmd` wrapper is not counted as a separate installation.

## What the merge buys you

LexForge combines OpenSpec documents with the agent workflow rules from superpowers.
The CLI checks that documents are ready and test results are current before the next stage.

| Taken from | What LexForge does with it |
| --- | --- |
| OpenSpec: the order `proposal → specs → design → tasks` | the schema sets the order, `status` shows readiness; a `blocked` document cannot be written |
| OpenSpec: requirements format | `### Requirement:` with `WHEN`/`THEN` scenarios, checked by `validate --strict` |
| OpenSpec: specifications in the repository | the delta is merged on `archive`, the change moves to `lexforge/changes/archive/` |
| superpowers: identifying the task type before design | the `lexforge` skill chooses an investigation (spike) or the `bounded` / `spec-driven` schema |
| superpowers: test-driven development (TDD) and independent review | `lexforge-apply` runs tests and independent review for each behavioural cycle |
| superpowers: completion backed by check results | `evidence record` runs the command and links the result to the commit and file state |

The CLI also checks plans for placeholders and requirements without tasks, and checks whether
saved results are stale. These checks have no disable flag. Skills read the current state
through `lexforge status --change <name> --json`. The design and plan stay in the change
directory without separate copies for each skill.

## How it works

```
request: "build X", "add Y", "fix Z"
    │
    ▼
skill: lexforge — names the class of work  ──►  spike: answer only, no change
    │  bounded · spec-driven
    ▼
lexforge new change <name>  ──►  branch feature/<name> from dev
    │
    ▼
PLANNING — project code is not touched. Every skill first calls
lexforge status --change <name> --json and works only on status `ready`;
on `blocked` it names what is missing and stops.
    lexforge-propose ──► proposal.md          one question at a time
    lexforge-spec    ──► specs/<cap>/spec.md  validate --strict → 0
    lexforge-design  ──► design.md            agreed section by section
    lexforge-plan    ──► tasks.md             check plan → 0
    │
    ▼  isPlanningComplete = true
IMPLEMENTATION — lexforge-apply, behavioural cycles (workflow 2)
    cycle start ──► RED ──► implementation ──► GREEN ──► cycle close
    at the wave boundary: one review of the wave, evidence record
    task grew past the spec → stop and ask the user
    │
    ▼
lexforge-verify · lexforge verify --change <name>
    CRITICAL found → back to lexforge-apply
    zero CRITICAL  → lexforge archive <change>
                     delta  → lexforge/specs/<capability>/spec.md
                     change → lexforge/changes/archive/<date>-<name>/
                     feature/<name> → merged into dev; dev → main only on your answer

off the pipeline: lexforge-debug — failing test, broken build, unexpected
behaviour; it works without a LexForge workspace too.
```

## Artifacts, gates, archive

Change documents live in `lexforge/changes/<name>/`: the proposal `proposal.md`,
requirements changes (delta specs), design decisions in `design.md` and the plan `tasks.md`.
The schema sets their order. Checks between stages are called gates.

`check plan` finds placeholders, references used in place of task descriptions and requirements
without tasks. It also checks section dependencies, group labels and files shared by groups
that would run concurrently. Each plan section must have its own file, linked from `tasks.md`.

In workflow 1, `evidence red` records a failing test run for a task. `verify` reports completed
tasks that write production code without such a record. `evidence record` runs a project check
and saves its result, exit code, commit and working-tree fingerprint as a stamp.
Editing the code makes the stamp stale; `check evidence` detects this.

`verify` reads saved results, so checks must run first. Workflow 2 also checks cycle closure,
review reports and current files against the latest reviewed snapshots. A cycle includes a
failing test (RED), implementation, a passing test (GREEN) and independent review.

An open `critical` or `important` entry in `lexforge/defects.json` blocks `verify` and `archive`.
A `minor` entry can remain open. `lexforge defect record --change <name> --level <level>
--file <path> --line <n> --summary <text>` adds an entry, `lexforge defect close <id>` closes it,
and `lexforge defect list` shows the ledger. Use `--change` and `--open` to filter entries.
Open and closed defects remain after the change is archived.

`archive` merges requirements changes into `lexforge/specs/<capability>/spec.md` and moves
the change directory to `lexforge/changes/archive/<date>-<name>/`. The repository retains
current requirements and the work history with its check results.

## Installation

A global install from [npm](https://www.npmjs.com/package/lexforge) puts the command on `PATH`,
which is how the skills call it. A project install pins the version and is called through `npx`:

```bash
npm install --save-dev lexforge && npx lexforge --version
```

With only a `devDependencies` install, the command may be unavailable on `PATH`.
In that case, `doctor` reports `path-not-resolved`. When local and global installs resolve to
different packages, it reports `path-multiple-installs`.

`lexforge init --tools <list>` installs skills for the runtimes listed, separated by commas.
`--scope project` installs them in the project (the default); `--scope user` uses the home
directory. `--language <code>` sets the document language. Directories depend on the runtime:

| Runtime | Project directory | User directory |
| --- | --- | --- |
| `agents` | `.agents/skills` | `~/.agents/skills` |
| `claude` | `.claude/skills` | `~/.claude/skills` |
| `codex` | `.codex/skills` | `~/.codex/skills` |
| `cursor` | `.cursor/skills` | `~/.cursor/skills` |
| `opencode` | `.opencode/skills` | `~/.config/opencode/skills` |

Several agents can read the shared `agents` directory.

## First run

### 1. Set up the workspace and install the skills

```bash
lexforge init --tools claude
```

The command creates `lexforge/config.yaml`, `lexforge/specs/`, `lexforge/changes/archive/`
and nine skill directories. Without `--tools`, it lists detected runtimes and asks you to
choose which ones to install skills for.

### 2. Check the installation

```bash
lexforge doctor
```

```
OK    Workspace and configuration
OK    Verification labels
OK    Installed skills
OK    Command name on PATH
OK    Git repository
OK    Node version
Next step: installation is healthy. Ask your agent to start work, for example: lexforge new change <name>
```

In a new directory, `doctor` reports two findings and returns `1` if there is no git repository
and no commands in `verification`. Run `git init`, make a first commit and add your check
commands to `lexforge/config.yaml`:

```yaml
verification:
  tests: npm test
  lint: npm run lint
```

A label name is lowercase letters and hyphens, and `evidence record --label tests` runs its command
from the workspace root. From here the commands are called by the agent.

## Model assignment

Each skill starts with a model block containing settings per provider. Planning and completion
checks use a strong model; implementation and debugging use a mid-tier model. Archiving does
not require a separate model.

To override these settings, name models for your runtimes in `lexforge/config.yaml`:

```yaml
models:
  tools:
    claude:
      provider: anthropic
      model: claude-opus-5
    codex:
      provider: openai
      model: gpt-5.6-sol
  providers:
    anthropic:
      - claude-opus-5
      - claude-sonnet-5
```

The runtime's entry in `models.tools` takes precedence. If absent, the top-level `default`
applies. With neither present, the skill uses its own model block.

`lexforge init --tools claude,codex` adds Anthropic settings for `claude` and OpenAI settings
for `codex`, without a top-level `default`. Set the provider and model yourself for `cursor`,
`opencode` and `agents`.

The installed package seeds the `providers` catalogue. You can edit it. Model names are not
validated against it, so you can specify a new name without updating LexForge.

Pass the runtime explicitly through `--tool`, for example
`lexforge instructions <artifact> --change <name> --tool codex --json` or
`lexforge status --change <name> --tool codex --json`.
Without `--tool`, the command uses the top level of `models`; runtime selection does not read
environment variables. If the current model differs from the assigned one, the skill hands
work to a subagent on that model. If it cannot start that model, it stops and explains why.

### A project installed before this version

`lexforge init` preserves an existing `config.yaml`. Without `models`, skills use their own
settings. Old role keys are ignored. To assign models, add the block above to
`lexforge/config.yaml` and replace the names.

### The handover in each runtime

Starting a subagent on another model depends on the runtime. All five runtimes use the same skills.

| Runtime | Model selection for a subagent |
|---|---|
| `claude` | Starting a subagent on the assigned model has been tested. |
| `agents`, `codex`, `cursor`, `opencode` | Handover has not been tested in this project. Until verified, leave the runtime without an entry in `models` and use the model specified by the skill. |

## The nine skills

The agent picks a skill by the `description` field in `SKILL.md`. Five skills handle planning.

| Skill | Fires when | Result |
| --- | --- | --- |
| `lexforge` | Building, adding or fixing something no change covers | The class of work named, a change created with the right schema |
| `lexforge-propose` | A proposal is asked for, or `proposal` is `ready` | `proposal.md`: the reason, the approach, the boundaries |
| `lexforge-spec` | Requirements are asked for, or `validate` finds a defect | Delta specs per capability with `WHEN`/`THEN` scenarios, a sequence diagram and contract table for interactions, a mockup for UI |
| `lexforge-design` | Decisions are asked for, on the `spec-driven` schema | `design.md`, agreed one section at a time |
| `lexforge-plan` | A plan is asked for, or `validate` finds a defect in it | `tasks.md`, each task naming a file and a verification command |

Skills wait until required documents are ready before starting implementation.

| Skill | Fires when | Result |
| --- | --- | --- |
| `lexforge-apply` | The artifacts are done, implementation is asked for | Behavioural cycles with RED/GREEN, independent review and evidence; the legacy task loop for workflow 1 |
| `lexforge-verify` | Implementation is finished, before archiving | Machine checks and review against requirements; open `CRITICAL` and `IMPORTANT` block completion |
| `lexforge-archive` | The report has no `CRITICAL` findings | The delta in `lexforge/specs/`, the change in the archive, the branch merged into `dev`, a question about `main` |
| `lexforge-debug` | A test fails, a build breaks, code behaves unexpectedly | The cause named, a failing test for the bug, one edit at that point |

Implementation skills check `isPlanningComplete`. Work starts once each document is prepared
or explicitly skipped. `lexforge-debug` also works without a LexForge workspace.

Do not edit installed skills to configure a project. `doctor` detects differences from the
package, and the next `init` overwrites the file. Put project rules in `context` and `rules`
in `lexforge/config.yaml`; agents receive them through `lexforge instructions`.

## Commands and exit codes

| Command, after `lexforge` | What it does |
| --- | --- |
| `init` | Sets up the `lexforge/` workspace and installs the skills; `--tools`, `--scope`, `--language` |
| `doctor` | Checks whether the local installation is healthy |
| `new change <name>` | Creates the change directory, `.lexforge.yaml` and `workflow.json` on a new `feature/<name>` branch from `dev`; `--schema` overrides the project default |
| `status` | Shows the artifact statuses of one change, or lists the active changes |
| `instructions <artifact> --change <name>` | Serves the template, the context, the rules and the instruction |
| `validate <change>` | Checks the artifacts and requirements; `--strict` adds completeness checks |
| `check plan --change <name>` | Checks plan completeness, dependencies and task groups |
| `check evidence --change <name>` | Compares the stamps against the code on disk; `--require` narrows the labels |
| `evidence record --change <name> --label <label>` | Runs the command of one label and records a stamp |
| `evidence red --change <name> --task <id> --command <cmd>` | Runs the command of one task and records the failing run |
| `context --change <name> --task <id>` | Returns current cycle context and source links; `--max-bytes` refuses oversize output without truncation |
| `workflow migrate --change <name> --to 2` | Previews with `--dry-run`; applies a recoverable migration after authorization |
| `cycle start --change <name> --cycle <id> --executor <identity>` | Captures the files before edits |
| `cycle run --change <name> --cycle <id> --phase red\|green` | Runs the cycle's declared command and records evidence |
| `cycle review --change <name> --wave <section> --file <path>` | Registers one independent report for every cycle of a plan section; `--cycle <id>` reviews one cycle |
| `cycle close --change <name> --cycle <id>` | Checks cycle completion and saves continuation state |
| `cycle restart --change <name> --cycle <id> --executor <identity>` | Starts a new attempt while retaining history and the original review baseline |
| `resume --change <name>` | Rebuilds continuation state from primary records |
| `verify --change <name>` | Checks a change before the work is called finished |
| `archive <change>` | Merges the delta and mockups into the specs, moves the change to the archive and merges `feature/<name>` into `dev` |
| `styles find` | Lists the project's CSS files for mockups |
| `styles set <paths...>` | Saves the chosen CSS files under `ui.styles` in `lexforge/config.yaml` |
| `defect record --change <name>` | Records a defect against a change; `--level`, `--file`, `--line`, `--summary` |
| `defect close <id>` | Marks a recorded defect as fixed |
| `defect list` | Lists recorded defects; `--change` and `--open` narrow the list |

With `--json`, commands write one JSON document to standard output and human messages to
standard error. Changes to JSON fields and exit codes are listed in the [CHANGELOG](CHANGELOG.md).

| Code | When |
| --- | --- |
| `0` | The command ran and found nothing |
| `1` | The command ran and found a violation: an unmet dependency, a requirement without a scenario, a leftover placeholder |
| `2` | The command cannot run: an unknown argument, a missing change, no workspace, no git repository |

Code `1` reports a finding or a rejected run. Code `2` means the call cannot proceed,
including stale evidence or unmet cycle prerequisites.
`doctor` has one exception: a missing workspace is a finding for it, so it answers `1`, not `2`.

## What to commit

| Path | Where |
| --- | --- |
| `lexforge/config.yaml` | Repository: the schema, the context, the rules and the labels are needed by the whole team |
| `lexforge/specs/` | Repository: the specs describe the shipped behaviour |
| `lexforge/changes/<name>/` with `evidence.json` | Repository: a stamp is tied to a commit, and review shows what it was taken on |
| `lexforge/changes/archive/` | Repository: closed changes with their artifacts and stamps |
| `lexforge/defects.json` | Repository: an entry outlives the change it was found in, and review needs to see what still stands |
| The runtime skill directories and `lexforge-install.json` | Locally: `lexforge init` brings them back on another machine |

`evidence.json` changes on every run, so two people working on the same change in parallel will get
a merge conflict on it.

## Line limit

The default limit is 400 lines, set by `file_limit.lines` in `lexforge/config.yaml`.
Lines are counted as in `wc -l`; exactly 400 is allowed. `file_limit.include` selects the
files to check. Its defaults cover 24 source and test extensions, including `**/*.ts`,
`**/*.py` and `**/*.vue`. A project's list replaces the defaults. Markdown, JSON, YAML and
lock files are excluded by default. Use a pattern such as `!src/generated/**` to exclude
generated or vendored code.

Before writing `tasks.md`, `lexforge-plan` counts lines in the files its tasks will touch.
For files over the limit, the user chooses `refactor` (split the file) or `keep` (retain it
without further growth). The choice is stored in the change's `.lexforge.yaml` as
`long_files: refactor` or `long_files: keep`.

`lexforge check plan` rejects a plan that names a long file without a `long_files` setting.
For `refactor`, the first task for that file must be marked `(move)`, so code is moved before
other edits.

`lexforge verify` checks touched files. With `refactor`, they must fit the limit. With `keep`,
a file already over the limit must not grow; other files must stay within the limit.
New files must fit the limit in both cases.

## Limits

`check plan` finds placeholders with regular expressions and may miss a vague task phrased
differently. Rules are extended as cases are found.

A stamp is tied to a commit and working-tree fingerprint. Edits require another run.
The stamp itself does not establish that tests cover all the required behaviour.

An agent using `lexforge-verify` assesses whether code follows `design.md`.
The CLI does not check the meaning of those decisions.

## License

MIT, © shepaland.
